module.exports = {
  pattern: '^\\.ping$',
  run: async (sock, m, text, from) => {
    await sock.sendMessage(from, { text: '*🏓 FRE BOT Pong!*' });
  }
}
