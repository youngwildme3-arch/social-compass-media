const fetch = require('node-fetch');

const requireAuth = (event) => {
  const auth = event.headers['x-admin-key'] || event.headers['X-Admin-Key'];
  return typeof auth === 'string' && auth === process.env.ADMIN_KEY;
};

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) };
  }
  if (!requireAuth(event)) {
    return { statusCode: 401, body: JSON.stringify({ error: 'Unauthorized' }) };
  }

  try {
    const { to, toName, subject, body, fromName, replyTo } = JSON.parse(event.body || '{}');
    if (!to || !subject || !body) {
      return { statusCode: 400, body: JSON.stringify({ error: 'Missing required fields' }) };
    }
    if (!/^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/.test(to)) {
      return { statusCode: 400, body: JSON.stringify({ error: 'Invalid email address: ' + to }) };
    }

    const sendgridApiKey = process.env.SENDGRID_API_KEY;
    if (!sendgridApiKey) {
      // Test mode - returns success but doesn't actually send
      return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          success: true, 
          messageId: 'test-' + Date.now(),
          note: 'Test mode - email prepared but not sent. Add SENDGRID_API_KEY to enable sending.',
          testData: { to, subject, bodyLength: body.length }
        })
      };
    }

    const sendFromName = fromName || 'Evan Jones';
    const sendFromEmail = 'evan@socialcompassmedia.com';
    const sendReplyTo = replyTo || sendFromEmail;

    const response = await fetch('https://api.sendgrid.com/v3/mail/send', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${sendgridApiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        personalizations: [{
          to: [{ email: to, name: toName }],
          subject: subject
        }],
        from: { email: sendFromEmail, name: sendFromName },
        reply_to: { email: sendReplyTo, name: sendFromName },
        content: [{
          type: 'text/plain',
          value: body
        }]
      })
    });

    if (response.ok) {
      return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          success: true, 
          messageId: response.headers.get('x-message-id') || 'sendgrid-' + Date.now(),
          status: 'sent'
        })
      };
    } else {
      const errorText = await response.text();
      throw new Error('SendGrid API error: ' + errorText);
    }

  } catch (err) {
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: err.message })
    };
  }
};