-- Marks the file as a DebtWise database, so tools such as `file` can tell it apart from other
-- SQLite files. 0x44425753 is "DBWS" in ASCII.

-- +goose Up
PRAGMA application_id = 1145198419;

-- +goose Down
PRAGMA application_id = 0;
