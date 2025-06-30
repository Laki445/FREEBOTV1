module.exports = {
  pattern: '^\\.alive$',
  run: async (sock, m, text, from) => {
    await sock.sendMessage(from, { text: '*✅ FRE BOT is Alive!*' });
  }
}
