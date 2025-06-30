
const express = require('express');
const pino = require('pino');
const fs = require('fs');
const path = require('path');
const { default: makeWASocket, useMultiFileAuthState, DisconnectReason } = require('@whiskeysockets/baileys');
const { Boom } = require('@hapi/boom');
const { generatePairingCode } = require('@whiskeysockets/baileys');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const sessions = {};

// Load plugins
const plugins = [];
const pluginDir = path.join(__dirname, 'plugins');
if (fs.existsSync(pluginDir)) {
  const pluginFiles = fs.readdirSync(pluginDir).filter(f => f.endsWith('.js'));
  for (const file of pluginFiles) {
    try {
      const plugin = require(path.join(pluginDir, file));
      if (plugin.pattern && plugin.run) plugins.push(plugin);
    } catch (e) {
      console.error('Plugin error:', file, e);
    }
  }
}

// Handle pair code request
app.get('/code', async (req, res) => {
  const number = req.query.number;
  if (!number) return res.json({ code: '❌ Invalid number' });

  const sessionPath = path.join(__dirname, 'session', number);
  if (!fs.existsSync(sessionPath)) fs.mkdirSync(sessionPath, { recursive: true });

  const { state, saveCreds } = await useMultiFileAuthState(sessionPath);
  const sock = makeWASocket({
    auth: state,
    printQRInTerminal: false,
    browser: ['FRE-BOT', 'Chrome', '1.0.0']
  });

  try {
    const code = await generatePairingCode(sock, number);
    console.log(`✅ Pairing Code for ${number}: ${code}`);
    sessions[number] = sock;

    sock.ev.on('creds.update', saveCreds);
    sock.ev.on('connection.update', (update) => {
      const { connection, lastDisconnect } = update;
      if (connection === 'close') {
        if ((lastDisconnect?.error)?.output?.statusCode !== DisconnectReason.loggedOut) {
          console.log('🔁 Reconnecting...');
        } else {
          console.log(`❌ Logged out: ${number}`);
          fs.rmSync(sessionPath, { recursive: true, force: true });
        }
      } else if (connection === 'open') {
        console.log(`✅ Connected to WhatsApp: ${number}`);
      }
    });

    sock.ev.on('messages.upsert', async ({ messages }) => {
      if (!messages || !messages[0]) return;
      const msg = messages[0];
      const from = msg.key.remoteJid;
      const text = msg.message?.conversation || msg.message?.extendedTextMessage?.text;
      if (!text || !from) return;

      for (const plugin of plugins) {
        if (new RegExp(plugin.pattern).test(text)) {
          try {
            await plugin.run(sock, msg, text, from);
          } catch (err) {
            console.error('Plugin run error:', err);
          }
        }
      }
    });

    res.json({ code });
  } catch (err) {
    console.error(err);
    res.json({ code: '⚠️ Error generating code' });
  }
});

app.listen(PORT, () => {
  console.log(`✅ FRE BOT server running at http://localhost:${PORT}`);
});
