CREATE DATABASE IF NOT EXISTS i18n;

USE i18n;

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