const bcrypt = require('bcrypt');

(async () => {
  const passwords = ['admin123', 'engineer123', 'coworker123'];
  for (const pwd of passwords) {
    const hash = await bcrypt.hash(pwd, 12);
    console.log(`${pwd}: ${hash}`);
  }
})();
