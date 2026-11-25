# Private Lightsail demo

This deployment is deliberately reachable only through SSH forwarding. It does not create AWS resources or change Lightsail networking. The app is a demo, not a production service: its authentication and authorization are not production-ready, and its payment UI uses a non-routable placeholder. Do not expose web ports or enter real resident or payment information.

## What the release contains

The packager builds the frontend with `VITE_API_BASE_URL=/api` from an allow-list in a temporary directory, substitutes `demo-paymentConfig.js`, and archives only the frontend build, backend runtime source and lockfile, fictional schema seed, and server configuration. It excludes all `.env` files, dependencies, Git metadata, the existing `frontend\dist`, and the source payment configuration. The upload sends only that ZIP to `/tmp` on the instance.

The setup script supports Ubuntu 24.04, installs Node.js 24, MySQL 8, and Nginx, and refuses to overwrite its named app/configuration paths or an existing demo database. It imports `database/schema.sql` into a fresh database and generates a random database password on the server. That password is written to `/etc/apartment-maintenance-portal/backend.env` with mode `0640` and is never printed.

## Before using the commands

In the AWS Lightsail console, open **Instances → your instance → Networking** and verify the IPv4 firewall has only SSH (TCP 22) allowed from your current public IP. Do not add HTTP, HTTPS, 8080, 4000, or MySQL rules. Keep billing settings unchanged. Note the instance's public IPv4 address. The SSH login is `ubuntu`.

Open Windows PowerShell in the project directory:

```powershell
Set-Location 'C:\Users\kairi\Downloads\apartment-maintenance-portal-phase1\apartment-maintenance-portal-phase1'
$InstanceIp = '<LIGHTSAIL_PUBLIC_IPV4>'
$KeyPath = 'C:\path\to\your-lightsail-key.pem'
```

### Package and upload

This builds the sanitized frontend, reviews and prints the archive entry names, then uploads only that archive. The PEM is passed to OpenSSH by path and is never read by the script.

```powershell
.\deployment\package-and-upload.ps1 -InstanceIp $InstanceIp -KeyPath $KeyPath
$ArchiveName = Get-ChildItem .\deployment\apartment-portal-demo-*.zip | Sort-Object LastWriteTime -Descending | Select-Object -First 1 -ExpandProperty Name
$RemoteStage = "/tmp/apartment-portal-$($ArchiveName -replace '\.zip$','')"
```

On the first SSH connection, OpenSSH may ask whether to trust the instance host key. Confirm only if the address is your Lightsail instance.

### Extract and deploy

The next command creates a new, private temporary directory and extracts the uploaded ZIP there without overwriting existing extracted files:

```powershell
ssh -i $KeyPath "ubuntu@$InstanceIp" "mkdir -m 700 -p '$RemoteStage' && unzip -n -q '/tmp/$ArchiveName' -d '$RemoteStage'"
```

This runs the reviewed setup script with root privileges. It installs packages, imports the fictional seed into a new database, installs the service/configuration, and performs a local health check; it does not edit AWS firewall or billing settings:

```powershell
ssh -i $KeyPath "ubuntu@$InstanceIp" "sudo bash '$RemoteStage/deployment/setup-ubuntu.sh'"
```

### Verify on the instance

This checks MySQL, Express, and Nginx systemd states and requests the private health endpoint. A healthy response reports both `backend` and `database` as `connected`:

```powershell
ssh -i $KeyPath "ubuntu@$InstanceIp" "systemctl is-active mysql apartment-portal nginx && curl --fail --silent --show-error http://127.0.0.1:8080/api/health"
```

### Open a private SSH tunnel

Run this in a dedicated PowerShell window and leave it open:

```powershell
ssh -i $KeyPath -N -L 8080:127.0.0.1:8080 "ubuntu@$InstanceIp"
```

In another PowerShell window, verify the site and API through the tunnel:

```powershell
Invoke-WebRequest http://127.0.0.1:8080/ | Select-Object StatusCode
Invoke-RestMethod http://127.0.0.1:8080/api/health | ConvertTo-Json
```

The tunnel is local to your computer; the site is not served on a public web port. To stop the tunnel, focus its PowerShell window and press `Ctrl+C`.
