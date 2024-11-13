import mysql from 'mysql2/promise';

const pool = await mysql.createPool({
  host: 'mysql',
  user: 'root',
  password: 'root',
  database: 'i18n',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

const model = {
  getDbConnection: async () => {
    return await pool.getConnection();
  },
  createTranslationsTable: async () => {
    const connection = await pool.getConnection();
    try {
      return await connection.execute(`
        CREATE TABLE IF NOT EXISTS i18n_translations (
          id INT AUTO_INCREMENT PRIMARY KEY,
          language_script_code VARCHAR(255) NOT NULL,
          column_name VARCHAR(255) NOT NULL,
          column_value TEXT,
          app_name VARCHAR(255),
          created_by VARCHAR(255),
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_by VARCHAR(255),
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          UNIQUE KEY unique_translation (language_script_code, column_name, app_name)
        );
      `);
    } finally {
      connection.release();
    }
  },
  mutilInsertTranslation: async (translations) => {
    const connection = await pool.getConnection();
    try {
      const values = [];
      const placeholders = translations.map(({ languageCode, key, value, appName }) => {
        values.push(languageCode, key, value, appName);
        return '(?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)';
      }).join(', ');

      // 检查是否已存在相同的记录
      const existingRows = await connection.execute(`
        SELECT language_script_code, column_name, app_name FROM i18n_translations
        WHERE (language_script_code, column_name, app_name) IN (${translations.map(() => '(?, ?, ?)').join(', ')})
      `, translations.flatMap(({ languageCode, key, appName }) => [languageCode, key, appName]));

      // 打印存在的相同记录
      const records = existingRows[0].map(row => {
        const record = `存在相同记录: language_script_code=${row.language_script_code}, column_name=${row.column_name}, app_name=${row.app_name}`
        return record;
      });

      // 执行批量插入，忽略已存在的记录
      const result = await connection.execute(`
        INSERT INTO i18n_translations (language_script_code, column_name, column_value, app_name, created_at, updated_at)
        VALUES ${placeholders}
        ON DUPLICATE KEY UPDATE column_value = VALUES(column_value), updated_at = CURRENT_TIMESTAMP
      `, values);
      return {
        result,
        records
      }
    } finally {
      connection.release();
    }
  },
  insertTranslation: async (languageCode, key, value, appName) => {
    const connection = await pool.getConnection();
    try {
      // 检查是否已存在相同的记录
      const [existingRows] = await connection.execute(`
        SELECT * FROM i18n_translations
        WHERE language_script_code = ? AND column_name = ? AND app_name = ?
      `, [languageCode, key, appName]);

      if (existingRows.length > 0) {
        return {
          error: '相同 app_name 下已有同 language_script_code 的同名 key'
        }
      }

      return await connection.execute(`
        INSERT INTO i18n_translations (language_script_code, column_name, column_value, app_name, created_at, updated_at)
        VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        ON DUPLICATE KEY UPDATE column_value = VALUES(column_value), updated_at = CURRENT_TIMESTAMP
      `, [languageCode, key, value, appName]);
    } finally {
      connection.release();
    }
  },
  updateTranslationById: async (id, column_value) => {
    const connection = await pool.getConnection();
    try {
      return await connection.execute(
        'UPDATE i18n_translations SET column_value = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
        [column_value, id]
      );
    } finally {
      connection.release();
    }
  },
  deleteTranslationByColumnAndApp: async (column_name, app_name) => {
    const connection = await pool.getConnection();
    try {
      return await connection.execute('DELETE FROM i18n_translations WHERE column_name = ? AND app_name = ?', [column_name, app_name]);
    } finally {
      connection.release();
    }
  },
  getTranslations: async (appName, columnName) => {
    const connection = await pool.getConnection();
    try {
      let query = `SELECT * FROM i18n_translations`;
      let params = [];
      if (appName) {
        query += ' WHERE app_name = ?';
        params.push(appName);
      }
      if (columnName) {
        const columnNames = columnName.split(',');
        if (appName) {
          query += ' AND column_name IN (' + columnNames.map(() => '?').join(', ') + ')';
        } else {
          query += ' WHERE column_name IN (' + columnNames.map(() => '?').join(', ') + ')';
        }
        params = params.concat(columnNames);
      }

      if (query === 'SELECT * FROM i18n_translations') {
        query += ' LIMIT 100';
      }

      const [rows] = await connection.execute(query, params);
      return rows;
    } finally {
      connection.release();
    }
  }
};

export default model;
