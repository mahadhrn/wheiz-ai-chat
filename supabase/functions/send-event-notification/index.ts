import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
//@ts-ignore
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const supabase = createClient(supabaseUrl, supabaseServiceKey);

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    console.log('📅 Processing event notification request');
    const { token, data: eventData } = await req.json();
    console.log('Received payload:', { token, eventData });
    
    if (!token) {
      console.error('❌ No push token provided');
      return new Response(
        JSON.stringify({ error: 'No push token provided' }),
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 400 
        }
      );
    }

    if (!eventData || !eventData.sender_id) {
      console.error('❌ Invalid event data:', eventData);
      return new Response(
        JSON.stringify({ error: 'Invalid event data: missing sender_id' }),
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 400 
        }
      );
    }

    console.log('👤 Fetching sender info for:', eventData.sender_id);

    // Get sender info
    const { data: senderData, error: senderError } = await supabase
      .from('users')
      .select('username, full_name')
      .eq('id', eventData.sender_id)
      .single();

    if (senderError) {
      console.error('❌ Error fetching sender:', senderError);
      return new Response(
        JSON.stringify({ error: 'Failed to fetch sender info', details: senderError }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 400,
        },
      );
    }

    if (!senderData) {
      console.error('❌ Sender not found:', eventData.sender_id);
      return new Response(
        JSON.stringify({ error: 'Sender not found' }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 404,
        },
      );
    }

    const notificationPayload = {
      to: token,
      title: `${senderData.full_name || senderData.username} created an event`,
      body: `${eventData.event_name} - ${eventData.event_description}`,
      data: {
        type: 'event',
        eventId: eventData.eventId,
        eventData: eventData,
        timestamp: new Date().toISOString()
      },
      sound: 'default',
      priority: 'high',
    };

    console.log('📤 Sending notification with payload:', {
      title: notificationPayload.title,
      body: notificationPayload.body,
      type: notificationPayload.data.type
    });

    // Send push notification using Expo's push notification service
    let expoResponse, expoResult;
    try {
      expoResponse = await fetch('https://exp.host/--/api/v2/push/send', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
        body: JSON.stringify(notificationPayload),
      });
      expoResult = await expoResponse.json();
      console.log('Expo push response:', expoResult);
    } catch (expoError) {
      console.error('❌ Error sending notification to Expo:', expoError);
      return new Response(
        JSON.stringify({
          error: 'Failed to send notification to Expo',
          details: expoError instanceof Error ? expoError.message : expoError,
        }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 200,
        }
      );
    }

    // Always return 200, log any Expo errors/warnings
    if (!expoResponse.ok) {
      console.warn('Expo push returned non-2xx status:', expoResult);
      return new Response(
        JSON.stringify({
          warning: 'Expo push returned non-2xx status',
          expoResult,
          notification: notificationPayload
        }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 200,
        }
      );
    }

    console.log('✅ Push notification sent successfully');
    return new Response(
      JSON.stringify({ 
        success: true, 
        result: expoResult,
        notification: notificationPayload 
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      },
    );
  } catch (error) {
    console.error('❌ Unexpected error:', error);
    return new Response(
      JSON.stringify({ 
        error: 'Internal server error',
        details: error instanceof Error ? error.message : 'Unknown error'
      }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
}); 