-- Create a function to handle message notifications
CREATE OR REPLACE FUNCTION public.handle_new_message()
RETURNS TRIGGER AS $$
BEGIN
  -- Call the edge function
  PERFORM
    net.http_post(
      url := CONCAT(current_setting('app.settings.supabase_url'), '/functions/v1/--send-message-notification'),
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', CONCAT('Bearer ', current_setting('app.settings.service_role_key'))
      ),
      body := jsonb_build_object('messageId', NEW.id)
    );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create the trigger
DROP TRIGGER IF EXISTS on_message_created ON public.messages;
CREATE TRIGGER on_message_created
  AFTER INSERT ON public.messages
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_message();

-- Add comment to explain the trigger
COMMENT ON TRIGGER on_message_created ON public.messages IS 'Triggers notification when a new message is created'; 