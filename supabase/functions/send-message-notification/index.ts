// <reference types="https://deno.land/std@0.168.0/http/server.ts" />
//@ts-ignore
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
//@ts-ignore
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const supabase = createClient(
  Deno.env.get("SUPABASE_URL") ?? "",
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
);

const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";

serve(async (req: Request) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const rawText = await req.text();
    if (!rawText) {
      return new Response(JSON.stringify({ error: 'Request body is empty' }), { 
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    let body;
    try {
      body = JSON.parse(rawText);
    } catch (e: any) {
      return new Response(JSON.stringify({ error: 'Invalid JSON in request body', details: e.message }), { 
        status: 400, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      });
    }

    const messageId = body.messageId;
    if (!messageId) {
      return new Response(JSON.stringify({ error: 'messageId is required' }), { 
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    console.log('📨 Processing notification for message:', messageId);

    const { data: message, error: messageError } = await supabase
      .from('messages')
      .select('id, chat_id, sender_id, content, file_type')
      .eq('id', messageId)
      .single();

    if (messageError || !message) {
      console.error('❌ Message not found:', messageId);
      return new Response(JSON.stringify({ error: 'Message not found' }), { 
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const { data: chat, error: chatError } = await supabase
      .from('chats')
      .select('user1_id, user2_id')
      .eq('id', message.chat_id)
      .single();

    if (chatError || !chat) {
      console.error('❌ Chat not found for message:', messageId);
      return new Response(JSON.stringify({ error: 'Chat not found' }), { 
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const recipientId = chat.user1_id === message.sender_id ? chat.user2_id : chat.user1_id;

    const { data: user, error: userError } = await supabase
      .from('users')
      .select('expo_push_token, username, full_name')
      .eq('id', recipientId)
      .single();

    if (userError) {
      console.error('❌ Error fetching recipient:', recipientId);
      return new Response(JSON.stringify({ error: 'Error fetching recipient user' }), { 
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const pushToken = user?.expo_push_token;
    if (!pushToken) {
      console.warn('⚠️ No push token found for user:', recipientId);
      return new Response(JSON.stringify({ message: 'No push token available' }), { 
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const { data: sender, error: senderError } = await supabase
      .from('users')
      .select('username, full_name')
      .eq('id', message.sender_id)
      .single();

    if (senderError) {
      console.error('❌ Error fetching sender:', message.sender_id);
      return new Response(JSON.stringify({ error: 'Error fetching sender information' }), { 
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const notificationPayload = {
      to: pushToken,
      title: sender.full_name || sender.username || 'New Message',
      body: message.file_type === 'audio' ? '🎤 sent a voice message' : 
            message.file_type === 'image' ? '📷 sent an image' :
            message.file_type === 'file' ? '📄 sent a file' :
            message.file_type === 'contact' ? (() => {
              // Try to parse contact name from vCard (FN: line)
              let contactName = '';
              if (message.content) {
                const match = message.content.match(/^FN:(.*)$/m);
                if (match && match[1]) {
                  contactName = match[1].trim();
                }
              }
              return `Contact Shared${contactName ? ': ' + contactName : ''}`;
            })() :
            (message.content || 'You have a new message'),
      data: { 
        type: 'message', 
        messageId: message.id,
        chatId: message.chat_id,
        timestamp: new Date().toISOString()
      },
      sound: 'default',
      priority: 'high',
      channelId: 'default'
    };

    console.log('📤 Sending notification to:', recipientId);
    console.log('📝 Notification content:', {
      title: notificationPayload.title,
      body: notificationPayload.body,
      type: notificationPayload.data.type
    });

    try {
      const pushResponse = await fetch(EXPO_PUSH_URL, {
        method: 'POST',
        headers: { 
          'Accept': 'application/json',
          'Accept-encoding': 'gzip, deflate',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(notificationPayload)
      });

      const responseData = await pushResponse.json();

      if (!pushResponse.ok) {
        console.error('❌ Push notification failed:', responseData);
        return new Response(JSON.stringify({ 
          error: 'Failed to send push notification', 
          status: pushResponse.status,
          details: responseData 
        }), { 
          status: 200, // Return 200 even on Expo push failure to prevent retries
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      console.log('✅ Push notification sent successfully to:', recipientId);
      return new Response(JSON.stringify({ success: true, response: responseData }), { 
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    } catch (error) {
      console.error('❌ Error sending push notification:', error);
      return new Response(JSON.stringify({ 
        error: 'Failed to send push notification',
        details: error instanceof Error ? error.message : 'Unknown error'
      }), { 
        status: 200, // Return 200 even on Expo push failure to prevent retries
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }
  } catch (error) {
    console.error('❌ Unexpected error:', error);
    return new Response(JSON.stringify({ 
      error: 'Internal server error',
      details: error instanceof Error ? error.message : 'Unknown error'
    }), { 
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
