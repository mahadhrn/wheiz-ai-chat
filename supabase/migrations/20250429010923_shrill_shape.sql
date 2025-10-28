/*
  # Chat Application Schema

  1. New Tables
    - `users`
      - `id` (uuid, primary key) - Maps to auth.users.id
      - `username` (text, unique) - User's display name
      - `email` (text, unique) - User's email address
      - `created_at` (timestamptz) - Account creation timestamp
    
    - `chats`
      - `id` (uuid, primary key) - Unique chat identifier
      - `created_at` (timestamptz) - Chat creation timestamp
      - `user1_id` (uuid) - First participant's ID
      - `user2_id` (uuid) - Second participant's ID
    
    - `messages`
      - `id` (uuid, primary key) - Unique message identifier
      - `chat_id` (uuid) - Reference to chats table
      - `sender_id` (uuid) - Message sender's ID
      - `content` (text) - Message content
      - `created_at` (timestamptz) - Message timestamp

  2. Security
    - Enable RLS on all tables
    - Add policies for authenticated users to:
      - Read their own user data
      - Read/write to chats they're part of
      - Read/write messages in their chats
*/

-- Create users table
CREATE TABLE IF NOT EXISTS users (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  username text UNIQUE NOT NULL,
  email text UNIQUE NOT NULL,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE users ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read their own data"
  ON users
  FOR SELECT
  TO authenticated
  USING (auth.uid() = id);

-- Create chats table
CREATE TABLE IF NOT EXISTS chats (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz DEFAULT now(),
  user1_id uuid REFERENCES users(id) ON DELETE CASCADE NOT NULL,
  user2_id uuid REFERENCES users(id) ON DELETE CASCADE NOT NULL,
  CONSTRAINT different_users CHECK (user1_id != user2_id)
);

ALTER TABLE chats ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read their chats"
  ON chats
  FOR SELECT
  TO authenticated
  USING (auth.uid() IN (user1_id, user2_id));

CREATE POLICY "Users can create chats"
  ON chats
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() IN (user1_id, user2_id));

-- Create messages table
CREATE TABLE IF NOT EXISTS messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  chat_id uuid REFERENCES chats(id) ON DELETE CASCADE NOT NULL,
  sender_id uuid REFERENCES users(id) ON DELETE CASCADE NOT NULL,
  content text NOT NULL,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read messages in their chats"
  ON messages
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM chats
      WHERE id = messages.chat_id
      AND auth.uid() IN (user1_id, user2_id)
    )
  );

CREATE POLICY "Users can send messages to their chats"
  ON messages
  FOR INSERT
  TO authenticated
  WITH CHECK (
    sender_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM chats
      WHERE id = chat_id
      AND auth.uid() IN (user1_id, user2_id)
    )
  );

-- Create users_read table to track message read status
CREATE TABLE IF NOT EXISTS users_read (
  user_id uuid REFERENCES users(id) ON DELETE CASCADE,
  chat_id uuid REFERENCES chats(id) ON DELETE CASCADE,
  last_read_at timestamptz DEFAULT now(),
  PRIMARY KEY (user_id, chat_id)
);

ALTER TABLE users_read ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read their own read status"
  ON users_read
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can update their own read status"
  ON users_read
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own read status"
  ON users_read
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Create function to handle user creation
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.users (id, email, username)
  VALUES (new.id, new.email, new.raw_user_meta_data->>'username');
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger for new user creation
CREATE OR REPLACE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();