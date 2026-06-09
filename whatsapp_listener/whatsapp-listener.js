import makeWASocket, { useMultiFileAuthState } from '@whiskeysockets/baileys';
import axios from 'axios';
import pino from 'pino';
import qrcode from 'qrcode-terminal';

let isRestarting = false;
async function startWhatsappListener() {
  const { state, saveCreds } = await useMultiFileAuthState('./whatsapp_auth');

  process.on('uncaughtException', (err) => {
    console.error('❗ Uncaught Exception:', err);
  });

  process.on('unhandledRejection', (reason) => {
    console.error('❗ Unhandled Rejection:', reason);
  });

  const sock = makeWASocket({
    auth: state,
    logger: pino({ level: 'silent' }),
    // printQRInTerminal: true, // نمایش QR در ترمینال
  });

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', async (update) => {
    const { qr, connection, lastDisconnect } = update;
    if (sock.user) {
      console.log('🤖 واتساپ بات لاگین شد با شماره:', sock.user.id);
    }

    if (qr) {
      console.log('⬛ QR واتساپ آماده:');

      qrcode.generate(qr, { small: true }, (q) => {
        console.log(q);
      });
    }

    if (connection === 'close') {
      const reason =
        lastDisconnect?.error?.output?.statusCode ||
        lastDisconnect?.error?.code ||
        lastDisconnect?.error?.message ||
        'unknown';

      console.log('❗ اتصال بسته شد — دلیل:', reason);

      if (!isRestarting) {
        isRestarting = true;
        console.log('🔄 تلاش برای اتصال مجدد در ۵ ثانیه...');
        setTimeout(() => {
          isRestarting = false;
          startWhatsappListener();
        }, 5000);
      }
    }

    if (connection === 'open') {
      console.log('✅ واتساپ کانکت شد');
    }
  });

  sock.ev.on('messages.upsert', async ({ messages }) => {
    const msg = messages[0];
    if (!msg.message || !msg.key.remoteJid) return;
    const API_URL = process.env.API_URL || 'http://localhost:5000';
    const sender = msg.key.remoteJid;
    const text =
      msg.message.conversation || msg.message.extendedTextMessage?.text || '';

    console.log('📩 پیام جدید دریافت شد:', sender, text);

    try {
      await axios.post(
        `${API_URL}/auth/register/whatsapp/webhook`,
        { sender, text },
        { timeout: 5000 },
      );
      console.log('✔ پیام ارسال شد به backend');
    } catch (err) {
      console.error(
        '❌ خطا در ارسال پیام:',
        err.message,
        err.response?.status,
        err.response?.data,
      );
    }
  });
}

startWhatsappListener();
