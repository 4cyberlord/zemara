use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Default, Serialize, Deserialize, PartialEq, Eq, PartialOrd, Ord)]
#[serde(rename_all = "kebab-case")]
pub enum SourceLifecycleStatus {
    #[default]
    Stopped,
    Starting,
    Live,
    PermissionNeeded,
    SourceMissing,
    Failed,
}
