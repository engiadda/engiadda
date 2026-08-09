const express = require('express');
const { checkDatabase } = require('../config/db');

const router = express.Router();

router.get('/', async (req, res, next) => {
  try {
    const databaseTime = await checkDatabase();
    res.json({ status: 'ok', service: 'engiadda-api', database: 'connected', databaseTime });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
