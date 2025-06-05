const express = require('express');
const app = express();
const PORT = 4000;

app.get('/', (req, res) => {
  res.send('Hello from the dynamic worker!');
});

app.listen(PORT, () => {
  console.log(`Worker listening on port ${PORT}`);
});
