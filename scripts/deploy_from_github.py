#!/usr/bin/env python3
import argparse
import json
import os
import subprocess
import sys
import tempfile
import time
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen


REPOSITORY = "Kullsitt/CS361Project"
BRANCH = "main"
CHECK_NAME = "Python and JavaScript tests"
REPO_DIR = Path("/home/ubuntu/backend")
VENV_PIP = Path("/home/ubuntu/backend/venv/bin/pip")
HEALTH_URL = "http://127.0.0.1:8000/api/health"
LOCK_FILE = Path("/run/lock/frws-deploy.lock")


def github_json(path):
    request = Request(
        f"https://api.github.com/repos/{REPOSITORY}/{path}",
        headers={
            "Accept": "application/vnd.github+json",
            "User-Agent": "frws-ec2-deployer",
            "X-GitHub-Api-Version": "2022-11-28",
        },
    )
    try:
        with urlopen(request, timeout=15) as response:
            return json.load(response)
    except HTTPError as error:
        raise RuntimeError(f"GitHub API returned HTTP {error.code}") from error
    except URLError as error:
        raise RuntimeError(f"GitHub API request failed: {error.reason}") from error


def latest_main_sha():
    branch = github_json(f"branches/{BRANCH}")
    return branch["commit"]["sha"]


def ci_check(sha):
    checks = github_json(f"commits/{sha}/check-runs?filter=latest&per_page=100")
    matching = [
        check
        for check in checks.get("check_runs", [])
        if check.get("name") == CHECK_NAME
        and check.get("head_sha") == sha
        and check.get("app", {}).get("slug") == "github-actions"
    ]
    if not matching:
        return "missing", None
    check = matching[0]
    return check.get("status", "unknown"), check.get("conclusion")


def run_as_ubuntu(*command, capture=False, check=True):
    result = subprocess.run(
        ["sudo", "-n", "-u", "ubuntu", *map(str, command)],
        check=check,
        text=True,
        stdout=subprocess.PIPE if capture else None,
        stderr=subprocess.PIPE if capture else None,
    )
    return result.stdout.strip() if capture else result.returncode


def git(*args, capture=False, check=True):
    return run_as_ubuntu(
        "git", "-C", REPO_DIR, *args, capture=capture, check=check
    )


def healthy():
    request = Request(HEALTH_URL, headers={"User-Agent": "frws-ec2-deployer"})
    try:
        with urlopen(request, timeout=10) as response:
            payload = json.load(response)
        return payload.get("status") == "online"
    except (HTTPError, URLError, TimeoutError, json.JSONDecodeError):
        return False


def install_requirements(requirements):
    run_as_ubuntu(VENV_PIP, "install", "-r", requirements)


def deploy(target_sha):
    if os.geteuid() != 0:
        raise RuntimeError("Run deployment as root through the systemd service")

    import fcntl

    LOCK_FILE.parent.mkdir(parents=True, exist_ok=True)
    with LOCK_FILE.open("w") as lock:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        git("fetch", "origin", BRANCH)
        fetched_sha = git("rev-parse", "FETCH_HEAD", capture=True)
        if fetched_sha != target_sha:
            print("main changed during the check; will retry on the next timer run")
            return

        current_branch = git("branch", "--show-current", capture=True)
        if current_branch != BRANCH:
            raise RuntimeError(f"Refusing deployment: checkout is on branch {current_branch!r}")
        if git("status", "--porcelain", "--untracked-files=no", capture=True):
            raise RuntimeError("Refusing deployment: tracked repository files changed locally")

        previous_sha = git("rev-parse", "HEAD", capture=True)
        if previous_sha == target_sha:
            print(f"EC2 is already at CI-passed commit {target_sha}")
            return

        is_fast_forward = git(
            "merge-base", "--is-ancestor", previous_sha, target_sha, check=False
        )
        if is_fast_forward != 0:
            raise RuntimeError("Refusing non-fast-forward deployment")

        requirement_backup = None
        changed_checkout = False
        try:
            previous_requirements = git(
                "show", f"{previous_sha}:backend/requirements.txt", capture=True
            )
            with tempfile.NamedTemporaryFile(
                mode="w", encoding="utf-8", prefix="frws-requirements-", delete=False
            ) as backup:
                backup.write(previous_requirements)
                backup.write("\n")
                requirement_backup = Path(backup.name)
            requirement_backup.chmod(0o644)

            git("merge", "--ff-only", target_sha)
            changed_checkout = True
            install_requirements(REPO_DIR / "backend/requirements.txt")
            subprocess.run(["systemctl", "restart", "fastapi.service"], check=True)

            for attempt in range(12):
                if healthy():
                    print(f"Deployment succeeded at {target_sha}")
                    return
                if attempt < 11:
                    time.sleep(5)
            raise RuntimeError("Health check failed after restart")
        except Exception:
            if changed_checkout:
                print(f"Deployment failed; restoring {previous_sha}")
                try:
                    if requirement_backup is not None:
                        install_requirements(requirement_backup)
                except Exception as error:
                    print(f"Warning: restoring previous dependencies failed: {error}")
                try:
                    git("reset", "--hard", previous_sha)
                except Exception as error:
                    print(f"Warning: restoring previous checkout failed: {error}")
                try:
                    subprocess.run(
                        ["systemctl", "restart", "fastapi.service"], check=True
                    )
                except Exception as error:
                    print(f"Warning: restarting previous service failed: {error}")
            raise
        finally:
            if requirement_backup is not None:
                requirement_backup.unlink(missing_ok=True)


def main():
    parser = argparse.ArgumentParser(description="Deploy CI-passed main to the EC2 backend")
    parser.add_argument(
        "--check-only",
        action="store_true",
        help="check the public GitHub main branch and CI status without deploying",
    )
    args = parser.parse_args()

    try:
        sha = latest_main_sha()
        status, conclusion = ci_check(sha)
        print(f"GitHub main: {sha}")
        print(f"CI check: {status}" + (f" / {conclusion}" if conclusion else ""))
        if status != "completed" or conclusion != "success":
            print("Not deploying; the latest main commit does not have a successful CI check.")
            return 0
        if args.check_only:
            print("Check passed; no deployment was performed.")
            return 0
        if latest_main_sha() != sha:
            print("main changed during the check; will retry on the next timer run")
            return 0
        deploy(sha)
        return 0
    except (HTTPError, URLError, RuntimeError, subprocess.CalledProcessError) as error:
        print(f"Deployment check failed: {error}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())
