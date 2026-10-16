// Compatibility entry point: keep a single secured backend implementation.
const { app } = require('./backend/server');
app.listen(process.env.PORT || 3000);
