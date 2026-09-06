use std::env;
use std::fs;
use std::path::PathBuf;

fn main() {
    tauri_build::build();

    // Copy WebView2Loader.dll alongside the final executable on Windows
    if env::var("CARGO_CFG_TARGET_OS").unwrap_or_default() == "windows" {
        let out_dir = PathBuf::from(env::var("OUT_DIR").unwrap());
        // Find target/{profile} directory
        let mut target_dir = out_dir.clone();
        while target_dir.file_name().map(|s| s != "target").unwrap_or(false) {
            target_dir.pop();
        }

        let profile = env::var("PROFILE").unwrap_or_else(|_| "release".into());
        let bin_dir = target_dir.join(&profile);

        // Find WebView2Loader.dll in target build directory
        let search_dir = target_dir.join(&profile).join("build");
        if search_dir.exists() {
            if let Ok(entries) = fs::read_dir(search_dir) {
                for entry in entries.flatten() {
                    let path = entry.path();
                    if path.is_dir() && path.file_name().map(|n| n.to_string_lossy().starts_with("webview2-com-sys-")).unwrap_or(false) {
                        let dll_x64 = path.join("out").join("x64").join("WebView2Loader.dll");
                        if dll_x64.exists() {
                            let _ = fs::copy(&dll_x64, bin_dir.join("WebView2Loader.dll"));
                            let _ = fs::copy(&dll_x64, out_dir.join("WebView2Loader.dll"));
                            break;
                        }
                    }
                }
            }
        }

        // LLVM-MinGW links release binaries against libunwind.dll. Bundle it
        // beside the executable so installed builds do not depend on the
        // developer toolchain being present on the user's machine.
        if let Some(path) = env::var_os("PATH").and_then(|paths| {
            env::split_paths(&paths)
                .map(|dir| dir.join("libunwind.dll"))
                .find(|path| path.exists())
        }) {
            let _ = fs::copy(&path, bin_dir.join("libunwind.dll"));
            let _ = fs::copy(&path, out_dir.join("libunwind.dll"));
            let manifest_dir = PathBuf::from(env::var("CARGO_MANIFEST_DIR").unwrap());
            let _ = fs::copy(&path, manifest_dir.join("libunwind.dll"));
        }
    }
}
