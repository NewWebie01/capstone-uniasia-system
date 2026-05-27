const bcrypt = require("bcrypt");

(async () => {
  const hash = await bcrypt.hash("Admin123!", 10);
  console.log(hash);
})();
