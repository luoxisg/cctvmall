from __future__ import annotations

import argparse
import os
import subprocess
from datetime import datetime
from pathlib import Path
from typing import List


SAFE_SYNC_PATHS = [
    "00_Dashboard",
    "Online_Export",
    "CEO_Arrangement",
    "Hermes_Agent",
    "README.md",
]


def run_git(args: List[str], cwd: Path) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        ["git", *args],
        cwd=str(cwd),
        text=True,
        capture_output=True,
        check=False,
    )


def load_local_env(vault_root: Path) -> None:
    env_path = vault_root / "Hermes_Agent" / ".env"
    if not env_path.exists():
        return
    for line in env_path.read_text(encoding="utf-8").splitlines():
        stripped = line.strip()
        if not stripped or stripped.startswith("#") or "=" not in stripped:
            continue
        key, value = stripped.split("=", 1)
        os.environ.setdefault(key.strip(), value.strip())


def ensure_repository(vault_root: Path) -> None:
    if (vault_root / ".git").exists():
        return

    branch_name = os.environ.get("GIT_DEFAULT_BRANCH", "main")
    init_result = run_git(["init"], vault_root)
    if init_result.returncode != 0:
        raise RuntimeError(init_result.stderr.strip() or init_result.stdout.strip())
    run_git(["branch", "-M", branch_name], vault_root)


def ensure_remote(vault_root: Path) -> None:
    remote_name = os.environ.get("GIT_REMOTE_NAME", "origin")
    remote_url = os.environ.get("GITHUB_REPO_URL", "").strip()
    if not remote_url:
        return

    current = run_git(["remote"], vault_root)
    if remote_name in current.stdout.split():
        return

    add_result = run_git(["remote", "add", remote_name, remote_url], vault_root)
    if add_result.returncode != 0:
        raise RuntimeError(add_result.stderr.strip() or add_result.stdout.strip())


def sync_safe_paths(vault_root: Path, commit_message: str, push: bool = False) -> str:
    load_local_env(vault_root)
    ensure_repository(vault_root)
    ensure_remote(vault_root)

    add_result = run_git(["add", *SAFE_SYNC_PATHS], vault_root)
    if add_result.returncode != 0:
        raise RuntimeError(add_result.stderr.strip() or add_result.stdout.strip())

    diff_result = run_git(["diff", "--cached", "--name-only"], vault_root)
    if diff_result.returncode != 0:
        raise RuntimeError(diff_result.stderr.strip() or diff_result.stdout.strip())

    changed = [line.strip() for line in diff_result.stdout.splitlines() if line.strip()]
    if not changed:
        return "No staged changes in safe sync scope."

    commit_result = run_git(["commit", "-m", commit_message], vault_root)
    if commit_result.returncode != 0:
        raise RuntimeError(commit_result.stderr.strip() or commit_result.stdout.strip())

    message = f"Committed {len(changed)} safe path change(s)."
    if push:
        remote_name = os.environ.get("GIT_REMOTE_NAME", "origin")
        branch_name = run_git(["branch", "--show-current"], vault_root).stdout.strip() or os.environ.get(
            "GIT_DEFAULT_BRANCH", "main"
        )
        push_result = run_git(["push", "-u", remote_name, branch_name], vault_root)
        if push_result.returncode != 0:
            raise RuntimeError(push_result.stderr.strip() or push_result.stdout.strip())
        message += f" Pushed to {remote_name}/{branch_name}."

    return message


def main() -> None:
    parser = argparse.ArgumentParser(description="Commit and optionally push safe vault files.")
    parser.add_argument("--vault-root", default=str(Path(__file__).resolve().parents[2]))
    parser.add_argument(
        "--commit-message",
        default=f"Hermes Agent sync {datetime.now().strftime('%Y-%m-%d %H:%M')}",
    )
    parser.add_argument("--push", action="store_true")
    args = parser.parse_args()

    print(sync_safe_paths(Path(args.vault_root), args.commit_message, push=args.push))


if __name__ == "__main__":
    main()
