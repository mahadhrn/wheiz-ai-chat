/*
  # Create chat application tables

  1. New Tables
    - `users` - Store user information
      - `id` (uuid, primary key)
      - `email` (text, unique)
      - `username` (text, unique)
      - `created_at` (timestamp)
    - `chats` - Store chat conversations between two users
      - `id` (uuid, primary key)
      - `created_at` (timestamp)
      - `user1_id` (uuid, foreign key)
      - `user2_id` (uuid, foreign key)
    - `messages` - Store messages within chats
      - `id` (uuid, primary key)
      - `chat_id` (uuid, foreign key)
      - `sender_id` (uuid, foreign key)
      - `content` (text)
      - `created_at` (timestamp)
  2. Security
    - Enable RLS on all tables
    - Add policies to control access to data
*/

-- Create users table
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT UNIQUE NOT NULL,
  username TEXT UNIQUE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create chats table
CREATE TABLE IF NOT EXISTS chats (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  user1_id UUID REFERENCES users(id) ON DELETE CASCADE NOT NULL,
  user2_id UUID REFERENCES users(id) ON DELETE CASCADE NOT NULL,
  CONSTRAINT different_users CHECK (user1_id <> user2_id)
);

-- Create messages table
CREATE TABLE IF NOT EXISTS messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  chat_id UUID REFERENCES chats(id) ON DELETE CASCADE NOT NULL,
  sender_id UUID REFERENCES users(id) ON DELETE CASCADE NOT NULL,
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable Row Level Security
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE chats ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;

-- Create policies for users table
CREATE POLICY "Users can view their own data" 
  ON users 
  FOR SELECT 
  USING (auth.uid() = id);

CREATE POLICY "Users can search for other users" 
  ON users 
  FOR SELECT 
  USING (true);

-- Create policies for chats table
CREATE POLICY "Users can view their own chats" 
  ON chats 
  FOR SELECT 
  USING (auth.uid() = user1_id OR auth.uid() = user2_id);

CREATE POLICY "Users can create chats" 
  ON chats 
  FOR INSERT 
  WITH CHECK (auth.uid() = user1_id OR auth.uid() = user2_id);

-- Create policies for messages table
CREATE POLICY "Users can view messages in their chats" 
  ON messages 
  FOR SELECT 
  USING (
    chat_id IN (
      SELECT id FROM chats 
      WHERE user1_id = auth.uid() OR user2_id = auth.uid()
    )
  );

CREATE POLICY "Users can send messages in their chats" 
  ON messages 
  FOR INSERT 
  WITH CHECK (
    sender_id = auth.uid() AND
    chat_id IN (
      SELECT id FROM chats 
      WHERE user1_id = auth.uid() OR user2_id = auth.uid()
    )
  );

-- Create function to handle new user creation
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
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

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS chats_user1_id_idx ON chats(user1_id);
CREATE INDEX IF NOT EXISTS chats_user2_id_idx ON chats(user2_id);
CREATE INDEX IF NOT EXISTS messages_chat_id_idx ON messages(chat_id);
CREATE INDEX IF NOT EXISTS messages_sender_id_idx ON messages(sender_id);
CREATE INDEX IF NOT EXISTS messages_created_at_idx ON messages(created_at);