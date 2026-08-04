use std::path::{Component, Path, PathBuf};

use thiserror::Error;

const MAX_PLAYBACK_FILE_BYTES: u64 = 64 * 1024 * 1024;

#[derive(Clone)]
pub struct RecordingFileStorage {
    root: PathBuf,
}

pub struct PlaybackFile {
    pub bytes: Vec<u8>,
    pub content_type: &'static str,
}

#[derive(Debug, Error)]
pub enum RecordingFileError {
    #[error("录制文件路径无效")]
    InvalidPath,
    #[error("录制文件不存在")]
    NotFound,
    #[error("录制文件存储不可用")]
    Unavailable,
}

impl RecordingFileStorage {
    pub fn new(root: PathBuf) -> Self {
        Self { root }
    }

    pub async fn read(
        &self,
        mpd_path: &str,
        file_name: &str,
    ) -> Result<PlaybackFile, RecordingFileError> {
        let relative_path = playback_relative_path(mpd_path, file_name)?;
        let canonical_root = tokio::fs::canonicalize(&self.root)
            .await
            .map_err(|_| RecordingFileError::Unavailable)?;
        let canonical_file = tokio::fs::canonicalize(canonical_root.join(relative_path))
            .await
            .map_err(|_| RecordingFileError::NotFound)?;
        if !canonical_file.starts_with(&canonical_root) {
            return Err(RecordingFileError::InvalidPath);
        }
        let metadata = tokio::fs::metadata(&canonical_file)
            .await
            .map_err(|_| RecordingFileError::Unavailable)?;
        if !metadata.is_file() || metadata.len() > MAX_PLAYBACK_FILE_BYTES {
            return Err(RecordingFileError::Unavailable);
        }
        let bytes = tokio::fs::read(canonical_file)
            .await
            .map_err(|_| RecordingFileError::Unavailable)?;
        Ok(PlaybackFile {
            bytes,
            content_type: content_type(file_name)?,
        })
    }
}

fn playback_relative_path(mpd_path: &str, file_name: &str) -> Result<PathBuf, RecordingFileError> {
    let mpd_path = mpd_path.trim_start_matches(['/', '\\']);
    let mpd_path = Path::new(mpd_path);
    if !is_normal_relative_path(mpd_path) {
        return Err(RecordingFileError::InvalidPath);
    }
    let requested_file = Path::new(file_name);
    if requested_file.components().count() != 1
        || !matches!(
            requested_file.components().next(),
            Some(Component::Normal(_))
        )
    {
        return Err(RecordingFileError::InvalidPath);
    }
    let manifest_name = mpd_path
        .file_name()
        .and_then(|name| name.to_str())
        .ok_or(RecordingFileError::InvalidPath)?;
    if file_name.ends_with(".mpd") && file_name != manifest_name {
        return Err(RecordingFileError::InvalidPath);
    }
    content_type(file_name)?;
    let directory = mpd_path.parent().ok_or(RecordingFileError::InvalidPath)?;
    Ok(directory.join(file_name))
}

fn is_normal_relative_path(path: &Path) -> bool {
    !path.as_os_str().is_empty()
        && path
            .components()
            .all(|component| matches!(component, Component::Normal(_)))
}

fn content_type(file_name: &str) -> Result<&'static str, RecordingFileError> {
    if file_name.ends_with(".mpd") {
        Ok("application/dash+xml")
    } else if file_name.ends_with(".m4s") {
        Ok("video/iso.segment")
    } else {
        Err(RecordingFileError::InvalidPath)
    }
}

#[cfg(test)]
mod tests {
    use super::{RecordingFileError, playback_relative_path};

    #[test]
    fn allows_manifest_and_its_sibling_segments_only() {
        let mpd_path = "/room-a/123/manifest.mpd";
        assert_eq!(
            playback_relative_path(mpd_path, "manifest.mpd").unwrap(),
            std::path::PathBuf::from("room-a")
                .join("123")
                .join("manifest.mpd")
        );
        assert_eq!(
            playback_relative_path(mpd_path, "a_seg_0001.m4s").unwrap(),
            std::path::PathBuf::from("room-a")
                .join("123")
                .join("a_seg_0001.m4s")
        );
    }

    #[test]
    fn rejects_paths_outside_the_recording_directory() {
        for invalid in [
            "../secret.m4s",
            "subdir/segment.m4s",
            "other.mpd",
            "video.mp4",
        ] {
            assert!(matches!(
                playback_relative_path("/room-a/123/manifest.mpd", invalid),
                Err(RecordingFileError::InvalidPath)
            ));
        }
        assert!(matches!(
            playback_relative_path("/room-a/../secret/manifest.mpd", "manifest.mpd"),
            Err(RecordingFileError::InvalidPath)
        ));
    }
}
