-- OSCE Platform - MySQL Initialization Script
-- Engine: MySQL 8+, Charset: utf8mb4
-- Safety reset
SET FOREIGN_KEY_CHECKS = 0;
CREATE DATABASE IF NOT EXISTS osce CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE osce;

-- -----------------------
-- Users, Classes, Enrolments
-- -----------------------
CREATE TABLE IF NOT EXISTS users (
  id              INT AUTO_INCREMENT PRIMARY KEY,
  email           VARCHAR(255) UNIQUE,
  username        VARCHAR(100) UNIQUE,
  full_name       VARCHAR(255),
  role            ENUM('student','teacher','admin') NOT NULL DEFAULT 'student',
  password_hash   VARCHAR(255),
  is_active       BOOLEAN NOT NULL DEFAULT TRUE,
  created_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS classes (
  id              INT AUTO_INCREMENT PRIMARY KEY,
  name            VARCHAR(255) NOT NULL,
  owner_id        INT NOT NULL,
  created_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_classes_owner FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE RESTRICT
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS class_enrolments (
  id              INT AUTO_INCREMENT PRIMARY KEY,
  class_id        INT NOT NULL,
  user_id         INT NOT NULL,
  created_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_class_user (class_id, user_id),
  CONSTRAINT fk_enrol_class FOREIGN KEY (class_id) REFERENCES classes(id) ON DELETE CASCADE,
  CONSTRAINT fk_enrol_user  FOREIGN KEY (user_id)  REFERENCES users(id)   ON DELETE CASCADE
) ENGINE=InnoDB;

-- -----------------------
-- Case Bank
-- -----------------------
CREATE TABLE IF NOT EXISTS cases (
  id              INT AUTO_INCREMENT PRIMARY KEY,
  title           VARCHAR(255) NOT NULL,
  body_md         LONGTEXT NOT NULL,
  tags            JSON DEFAULT (JSON_ARRAY()),
  created_by      INT NOT NULL,
  created_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FULLTEXT KEY ft_cases_title (title),
  CONSTRAINT fk_cases_owner FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE RESTRICT
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS case_assets (
  id              INT AUTO_INCREMENT PRIMARY KEY,
  case_id         INT NOT NULL,
  kind            ENUM('image','pdf','audio','other') NOT NULL,
  url             VARCHAR(1000) NOT NULL,
  CONSTRAINT fk_case_assets_case FOREIGN KEY (case_id) REFERENCES cases(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- -----------------------
-- Exams (“Circuits”) and Stations
-- -----------------------
CREATE TABLE IF NOT EXISTS exams (
  id               INT AUTO_INCREMENT PRIMARY KEY,
  class_id         INT NOT NULL,
  name             VARCHAR(255) NOT NULL,
  exam_type        ENUM('practice','exam') NOT NULL,
  difficulty       ENUM('low','medium','high') NOT NULL,
  total_stations   INT NOT NULL,
  time_limit_min   INT NOT NULL,
  reading_min      INT NOT NULL DEFAULT 0,
  access_code_hash VARCHAR(255) NOT NULL,     -- store hash only
  description      TEXT,
  start_at         DATETIME NULL,
  created_by       INT NOT NULL,
  created_at       TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at       TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_exams_lookup (class_id, exam_type, difficulty, start_at),
  CONSTRAINT fk_exams_class FOREIGN KEY (class_id) REFERENCES classes(id) ON DELETE RESTRICT,
  CONSTRAINT fk_exams_owner FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE RESTRICT
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS stations (
  id              INT AUTO_INCREMENT PRIMARY KEY,
  exam_id         INT NOT NULL,
  position        INT NOT NULL,             -- 1..N order
  case_id         INT NOT NULL,
  UNIQUE KEY uq_station_order (exam_id, position),
  KEY idx_stations_exam (exam_id, position),
  CONSTRAINT fk_stations_exam FOREIGN KEY (exam_id) REFERENCES exams(id) ON DELETE CASCADE,
  CONSTRAINT fk_stations_case FOREIGN KEY (case_id) REFERENCES cases(id) ON DELETE RESTRICT
) ENGINE=InnoDB;

-- -----------------------
-- Questions (per station)
-- -----------------------
CREATE TABLE IF NOT EXISTS questions (
  id              INT AUTO_INCREMENT PRIMARY KEY,
  station_id      INT NOT NULL,
  qtype           ENUM('mcq','short','explain') NOT NULL,
  prompt          TEXT NOT NULL,
  options_json    JSON NULL,
  correct_index   INT NULL,
  reference_text  TEXT NULL,
  display_order   INT NOT NULL DEFAULT 1,
  KEY idx_questions_station (station_id, display_order),
  CONSTRAINT fk_questions_station FOREIGN KEY (station_id) REFERENCES stations(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- -----------------------
-- Rubrics
-- -----------------------
CREATE TABLE IF NOT EXISTS rubrics (
  id              INT AUTO_INCREMENT PRIMARY KEY,
  station_id      INT NOT NULL,
  rubric_key      VARCHAR(100) NOT NULL,
  title           VARCHAR(255) NOT NULL,
  max_points      INT NOT NULL DEFAULT 0,
  display_order   INT NOT NULL DEFAULT 1,
  UNIQUE KEY uq_rubric_key (station_id, rubric_key),
  CONSTRAINT fk_rubrics_station FOREIGN KEY (station_id) REFERENCES stations(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- -----------------------
-- Attempts (exam + per-station), Chat, Answers, Marking
-- -----------------------
CREATE TABLE IF NOT EXISTS exam_attempts (
  id              INT AUTO_INCREMENT PRIMARY KEY,
  exam_id         INT NOT NULL,
  user_id         INT NOT NULL,
  status          ENUM('draft','submitted','graded') NOT NULL DEFAULT 'draft',
  started_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  submitted_at    DATETIME NULL,
  graded_at       DATETIME NULL,
  total_score     DECIMAL(6,2) NULL,
  UNIQUE KEY uq_exam_user (exam_id, user_id),
  KEY idx_exam_attempts_exam (exam_id),
  CONSTRAINT fk_attempts_exam FOREIGN KEY (exam_id) REFERENCES exams(id) ON DELETE RESTRICT,
  CONSTRAINT fk_attempts_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE RESTRICT
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS station_attempts (
  id                 INT AUTO_INCREMENT PRIMARY KEY,
  exam_attempt_id    INT NOT NULL,
  station_id         INT NOT NULL,
  status             ENUM('draft','submitted','graded') NOT NULL DEFAULT 'draft',
  work_min           INT NULL,
  reading_min        INT NULL,
  started_at         DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  submitted_at       DATETIME NULL,
  UNIQUE KEY uq_station_attempt (exam_attempt_id, station_id),
  KEY idx_station_attempts_attempt (exam_attempt_id, station_id),
  CONSTRAINT fk_station_attempts_attempt FOREIGN KEY (exam_attempt_id) REFERENCES exam_attempts(id) ON DELETE CASCADE,
  CONSTRAINT fk_station_attempts_station FOREIGN KEY (station_id) REFERENCES stations(id) ON DELETE RESTRICT
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS chat_messages (
  id                 INT AUTO_INCREMENT PRIMARY KEY,
  station_attempt_id INT NOT NULL,
  side               ENUM('user','ai') NOT NULL,
  content            LONGTEXT NOT NULL,
  created_at         TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_chat_station (station_attempt_id, created_at),
  CONSTRAINT fk_chat_station FOREIGN KEY (station_attempt_id) REFERENCES station_attempts(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS answers (
  id                 INT AUTO_INCREMENT PRIMARY KEY,
  station_attempt_id INT NOT NULL,
  question_id        INT NOT NULL,
  value_text         LONGTEXT NULL,
  choice_index       INT NULL,
  is_auto_correct    BOOLEAN NULL,
  auto_score         DECIMAL(6,2) NULL,
  created_at         TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_answer_once (station_attempt_id, question_id),
  KEY idx_answers_station (station_attempt_id),
  CONSTRAINT fk_answers_station FOREIGN KEY (station_attempt_id) REFERENCES station_attempts(id) ON DELETE CASCADE,
  CONSTRAINT fk_answers_question FOREIGN KEY (question_id)        REFERENCES questions(id)        ON DELETE RESTRICT
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS rubric_marks (
  id                 INT AUTO_INCREMENT PRIMARY KEY,
  station_attempt_id INT NOT NULL,
  rubric_id          INT NOT NULL,
  met                BOOLEAN NOT NULL DEFAULT FALSE,
  points             INT NULL,
  UNIQUE KEY uq_rubric_once (station_attempt_id, rubric_id),
  CONSTRAINT fk_rmark_station FOREIGN KEY (station_attempt_id) REFERENCES station_attempts(id) ON DELETE CASCADE,
  CONSTRAINT fk_rmark_rubric  FOREIGN KEY (rubric_id)          REFERENCES rubrics(id)          ON DELETE RESTRICT
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS feedback (
  id                 INT AUTO_INCREMENT PRIMARY KEY,
  station_attempt_id INT NOT NULL,
  teacher_id         INT NOT NULL,
  text               TEXT NOT NULL,
  created_at         TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_feedback_station (station_attempt_id),
  CONSTRAINT fk_feedback_station FOREIGN KEY (station_attempt_id) REFERENCES station_attempts(id) ON DELETE CASCADE,
  CONSTRAINT fk_feedback_teacher FOREIGN KEY (teacher_id)         REFERENCES users(id)            ON DELETE RESTRICT
) ENGINE=InnoDB;

-- -----------------------
-- Access control logs (Stations modal integrity + code checks)
-- -----------------------
CREATE TABLE IF NOT EXISTS exam_access_logs (
  id                 INT AUTO_INCREMENT PRIMARY KEY,
  exam_id            INT NOT NULL,
  user_id            INT NOT NULL,
  ip                 VARCHAR(64) NULL,
  user_agent         VARCHAR(500) NULL,
  accepted_integrity BOOLEAN NOT NULL,
  verified_at        DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_access_exam_user (exam_id, user_id, verified_at),
  CONSTRAINT fk_access_exam  FOREIGN KEY (exam_id) REFERENCES exams(id) ON DELETE CASCADE,
  CONSTRAINT fk_access_user  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- -----------------------
-- Flashcards (used by flashcard.js)
-- -----------------------
CREATE TABLE IF NOT EXISTS flashcard_decks (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  owner_id    INT NOT NULL,
  name        VARCHAR(255) NOT NULL,
  created_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_decks_owner (owner_id),
  CONSTRAINT fk_decks_owner FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS flashcards (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  deck_id     INT NOT NULL,
  front       TEXT NOT NULL,
  back        TEXT NOT NULL,
  created_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_cards_deck (deck_id),
  CONSTRAINT fk_cards_deck FOREIGN KEY (deck_id) REFERENCES flashcard_decks(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS flashcard_reviews (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  card_id     INT NOT NULL,
  user_id     INT NOT NULL,
  rating      INT NOT NULL,
  reviewed_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK (rating BETWEEN 1 AND 5),
  KEY idx_reviews_card (card_id),
  KEY idx_reviews_user (user_id),
  CONSTRAINT fk_reviews_card FOREIGN KEY (card_id) REFERENCES flashcards(id) ON DELETE CASCADE,
  CONSTRAINT fk_reviews_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;

SET FOREIGN_KEY_CHECKS = 1;
