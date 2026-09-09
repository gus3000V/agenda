-- Script to create the initial database and tables
-- Run this in psql or pgAdmin:
-- CREATE DATABASE express_vue_db;
-- \c express_vue_db

CREATE TABLE IF NOT EXISTS items (
    id SERIAL PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    completed BOOLEAN DEFAULT false,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO items (title, completed) VALUES 
('Learn Vue 3', true),
('Learn Express', true),
('Connect to PostgreSQL', false);
