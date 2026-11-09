# EC2 deployment from GitHub

The GitHub Actions workflow in `.github/workflows/ci.yml` runs tests only. A
systemd timer on EC2 checks the public `main` branch and its GitHub Actions check
status. It deploys only after the `Python and JavaScript tests` check succeeds.
The EC2 instance makes outbound HTTPS requests; GitHub does not need AWS
credentials, an OIDC provider, an inbound SSH rule, or a deploy key.

This setup relies on the repository being public so EC2 can read the GitHub API
and fetch the repository without credentials. If the repository becomes
private, stop the timer and configure an approved authentication method before
using this deployment mechanism.

The deploy script assumes:

- The checkout is `/home/ubuntu/backend`, owned by `ubuntu`.
- The existing virtual environment is `/home/ubuntu/backend/venv`.
- `fastapi.service` runs the backend and reads database settings from its
  existing EC2 `.env`; deployment does not change `.env`.
- The instance has Python 3, Git, `sudo`, and outbound HTTPS access to GitHub.

## Install the poller through SSM

First push this setup to `main` and wait for its GitHub Actions tests to pass.
Open an SSM session to EC2 and run these commands. They fetch the deployment
files but do not move the application checkout or restart the backend:

```bash
sudo install -d -o root -g root -m 755 /usr/local/libexec
sudo -u ubuntu git -C /home/ubuntu/backend fetch origin main
sudo -u ubuntu git -C /home/ubuntu/backend show origin/main:scripts/deploy_from_github.py | sudo tee /usr/local/libexec/frws-deploy.py >/dev/null
sudo -u ubuntu git -C /home/ubuntu/backend show origin/main:deploy/systemd/frws-deploy.service | sudo tee /etc/systemd/system/frws-deploy.service >/dev/null
sudo -u ubuntu git -C /home/ubuntu/backend show origin/main:deploy/systemd/frws-deploy.timer | sudo tee /etc/systemd/system/frws-deploy.timer >/dev/null
sudo chown root:root /usr/local/libexec/frws-deploy.py /etc/systemd/system/frws-deploy.service /etc/systemd/system/frws-deploy.timer
sudo chmod 755 /usr/local/libexec/frws-deploy.py
sudo chmod 644 /etc/systemd/system/frws-deploy.service /etc/systemd/system/frws-deploy.timer
sudo /usr/bin/python3 /usr/local/libexec/frws-deploy.py --check-only
```

The check-only command reports the current public `main` SHA and its CI result; it
does not deploy. If the check reports a pending or unsuccessful CI run, wait for
the GitHub Actions run to pass before enabling the timer.

Then enable periodic deployment:

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now frws-deploy.timer
sudo systemctl list-timers --all frws-deploy.timer --no-pager
```

The timer checks every five minutes. Review execution and logs with:

```bash
sudo systemctl status frws-deploy.timer --no-pager
sudo journalctl -u frws-deploy.service -n 50 --no-pager
```

## Safety behavior and scope

The poller verifies that the latest `main` SHA has a successful GitHub Actions
check named `Python and JavaScript tests`, rechecks that `main` did not move
during verification, and fetches that exact SHA. It refuses to deploy if tracked
files in the EC2 checkout were edited locally or if the update is not a
fast-forward. The untracked virtual environment outside the Git checkout and
the server `.env` are not cleaned or overwritten.

After updating, it installs `backend/requirements.txt`, restarts
`fastapi.service`, and checks `http://127.0.0.1:8000/api/health`. On failure it
attempts to restore the previous requirements, checkout, and service. Check
`journalctl` if rollback or restart reports an error.

This deploys the backend only. It does not publish the static frontend, apply
database migrations, or replace functional checks of database-backed features.
The GitHub Actions health-independent test suite must pass before EC2 deploys.
