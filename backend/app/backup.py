"""Database backup system for persisted SQLite storage + restaurant seeds."""

from __future__ import annotations

import json
import logging
import shutil
from datetime import datetime
from pathlib import Path

from .settings import settings

DB_FILENAME = "baku_reserve.db"

logger = logging.getLogger(__name__)


class BackupManager:
    """
    Manager for automated database backups.

    Creates timestamped backups of the JSON database files with:
    - Automatic rotation (keeps last N backups)
    - Gzip compression to save space
    - Backup verification
    - Easy restoration
    """

    def __init__(
        self,
        backup_dir: Path | None = None,
        max_backups: int = 30,
        compress: bool = True,
    ):
        """
        Initialize backup manager.

        Args:
            backup_dir: Directory to store backups (defaults to data_dir/backups)
            max_backups: Maximum number of backups to keep
            compress: Whether to gzip-compress backups
        """
        self.backup_dir = backup_dir or (settings.data_dir / "backups")
        self.max_backups = max_backups
        self.compress = compress

        # Ensure backup directory exists
        self.backup_dir.mkdir(parents=True, exist_ok=True)

    def create_backup(self, description: str | None = None) -> Path:
        """
        Create a backup of the database.

        Args:
            description: Optional description for this backup

        Returns:
            Path to the created backup file

        Raises:
            IOError: If backup creation fails
        """
        timestamp = datetime.utcnow().strftime("%Y%m%d_%H%M%S")
        backup_name = f"backup_{timestamp}"

        if description:
            # Sanitize description for filename
            safe_desc = "".join(
                c if c.isalnum() or c in "-_" else "_" for c in description
            )
            backup_name = f"{backup_name}_{safe_desc[:50]}"

        # Create backup directory for this backup
        backup_path = self.backup_dir / backup_name
        backup_path.mkdir(parents=True, exist_ok=True)

        try:
            # Backup primary database file
            db_path = settings.data_dir / DB_FILENAME
            self._copy_file(
                source=db_path,
                dest=backup_path / DB_FILENAME,
                verify_json=False,
            )

            # Backup restaurants.json if it exists
            restaurants_path = settings.data_dir / "restaurants.json"
            if restaurants_path.exists():
                self._copy_file(
                    source=restaurants_path,
                    dest=backup_path / "restaurants.json",
                    verify_json=True,
                )

            # Create manifest file with metadata
            manifest = {
                "timestamp": timestamp,
                "description": description,
                "files": [
                    DB_FILENAME,
                    "restaurants.json" if restaurants_path.exists() else None,
                ],
                "compressed": self.compress,
            }
            manifest_path = backup_path / "manifest.json"
            manifest_path.write_text(json.dumps(manifest, indent=2))

            # Compress if enabled
            if self.compress:
                compressed_path = self._compress_backup(backup_path)
                # Remove uncompressed directory
                shutil.rmtree(backup_path)
                final_path = compressed_path
            else:
                final_path = backup_path

            logger.info(
                "Database backup created",
                path=str(final_path),
                size_bytes=self._get_size(final_path),
            )

            # Rotate old backups
            self._rotate_backups()

            return final_path

        except Exception as exc:
            logger.error(f"Failed to create backup: {exc}")
            # Clean up partial backup
            if backup_path.exists():
                shutil.rmtree(backup_path)
            raise

    def _copy_file(self, source: Path, dest: Path, verify_json: bool = False) -> None:
        """Copy a single file to backup location."""
        if not source.exists():
            logger.warning(f"Source file does not exist: {source}")
            return

        shutil.copy2(source, dest)

        # Verify backup
        if not dest.exists():
            raise OSError(f"Backup verification failed: {dest}")

        if verify_json:
            try:
                with open(dest) as f:
                    json.load(f)
            except json.JSONDecodeError as exc:
                raise OSError(f"Backup JSON verification failed: {dest}") from exc

    def _compress_backup(self, backup_dir: Path) -> Path:
        """Compress backup directory to .tar.gz file."""
        import tarfile

        archive_name = f"{backup_dir.name}.tar.gz"
        archive_path = self.backup_dir / archive_name

        with tarfile.open(archive_path, "w:gz") as tar:
            tar.add(backup_dir, arcname=backup_dir.name)

        return archive_path

    def _get_size(self, path: Path) -> int:
        """Get total size of file or directory in bytes."""
        if path.is_file():
            return path.stat().st_size
        return sum(f.stat().st_size for f in path.rglob("*") if f.is_file())

    def _rotate_backups(self) -> None:
        """Remove old backups beyond max_backups limit."""
        # Get all backups (both compressed and uncompressed)
        backups = sorted(
            [p for p in self.backup_dir.iterdir() if p.name.startswith("backup_")],
            key=lambda p: p.stat().st_mtime,
            reverse=True,  # Newest first
        )

        # Remove excess backups
        for old_backup in backups[self.max_backups :]:
            try:
                if old_backup.is_dir():
                    shutil.rmtree(old_backup)
                else:
                    old_backup.unlink()
                logger.info(f"Rotated old backup: {old_backup.name}")
            except Exception as exc:
                logger.warning(f"Failed to remove old backup {old_backup}: {exc}")

    def list_backups(self) -> list[dict[str, any]]:
        """
        List all available backups.

        Returns:
            List of backup metadata dicts
        """
        backups = []

        for backup_path in sorted(self.backup_dir.iterdir(), reverse=True):
            if not backup_path.name.startswith("backup_"):
                continue

            # Extract timestamp from filename
            parts = backup_path.name.split("_")
            if len(parts) >= 3:
                timestamp_str = f"{parts[1]}_{parts[2]}"
            else:
                timestamp_str = "unknown"

            backup_info = {
                "name": backup_path.name,
                "path": str(backup_path),
                "timestamp": timestamp_str,
                "size_bytes": self._get_size(backup_path),
                "compressed": backup_path.suffix == ".gz",
                "created_at": datetime.fromtimestamp(backup_path.stat().st_mtime),
            }

            backups.append(backup_info)

        return backups

    def restore_backup(self, backup_name: str) -> None:
        """
        Restore database from a backup.

        Args:
            backup_name: Name of the backup to restore

        Raises:
            FileNotFoundError: If backup doesn't exist
            IOError: If restoration fails
        """
        backup_path = self.backup_dir / backup_name

        if not backup_path.exists():
            raise FileNotFoundError(f"Backup not found: {backup_name}")

        # Create safety backup of current state before restoring
        logger.info("Creating safety backup before restoration...")
        self.create_backup(description="pre_restore_safety")

        try:
            if backup_path.suffix == ".gz":
                # Extract compressed backup
                import tarfile
                import tempfile

                with tempfile.TemporaryDirectory() as tmpdir:
                    with tarfile.open(backup_path, "r:gz") as tar:
                        tar.extractall(tmpdir)

                    # Find extracted directory
                    extracted_dir = Path(tmpdir) / backup_path.stem.replace(".tar", "")

                    if not extracted_dir.exists():
                        # Try finding any directory in tmpdir
                        subdirs = list(Path(tmpdir).iterdir())
                        if subdirs:
                            extracted_dir = subdirs[0]

                    self._restore_files(extracted_dir)
            else:
                # Uncompressed backup directory
                self._restore_files(backup_path)

            logger.info(f"Database restored from backup: {backup_name}")

        except Exception as exc:
            logger.error(f"Failed to restore backup: {exc}")
            raise

    def _restore_files(self, backup_dir: Path) -> None:
        """Restore files from backup directory."""
        # Restore primary database file
        db_backup = backup_dir / DB_FILENAME
        if db_backup.exists():
            shutil.copy2(db_backup, settings.data_dir / DB_FILENAME)

        # Restore restaurants.json if it exists in backup
        restaurants_backup = backup_dir / "restaurants.json"
        if restaurants_backup.exists():
            shutil.copy2(restaurants_backup, settings.data_dir / "restaurants.json")


# Global backup manager instance
backup_manager = BackupManager()


__all__ = ["BackupManager", "backup_manager"]
