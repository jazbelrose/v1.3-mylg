create-gallery service

This service contains the standalone `createGalleryFunction` Python Lambda.

How to build (recommended: WSL/Docker/CI)

- Use WSL or a Linux CI runner to pip install PyMuPDF into the `python/` directory or build a Lambda Layer / container image.
- Example (WSL):
  python3.9 -m venv venv
  source venv/bin/activate
  pip install --target=python -r requirements.txt

Packaging & deploy
- Use the helper scripts in `./scripts/` to build and produce `.serverless/createGalleryFunction.zip` locally. Then either use the AWS CLI or the Serverless Framework to update the function or deploy the stack.

Notes
- Do NOT commit compiled .so files into the repo. Use `.gitignore` to avoid tracking build artifacts.

Additional build & deploy notes (migrated from the projects docs)

Quick build steps (WSL recommended)
- cd to `backend/create-gallery`
- Create a Python 3.9 venv and install into the `python/` target directory:
  - python3.9 -m venv venv
  - source venv/bin/activate
  - pip install --target=python -r requirements.txt

Prepare the ZIP for deployment (local test)
- From `backend/create-gallery` you can create the deployment zip:
  ```powershell
  Remove-Item -Force .serverless\createGalleryFunction.zip -ErrorAction SilentlyContinue
  Compress-Archive -Path lambda_function.py, requirements.txt, python\* -DestinationPath .serverless\createGalleryFunction.zip -Force
  ```

Deploy options
- Quick: Use the existing PowerShell helper to upload only the lambda code (low risk):
  - From repository root: `backend/projects/scripts/deploy_create_gallery.ps1 -FunctionName mylg-v12-create-gallery-dev -Region us-west-2`
  - Or run `backend/create-gallery/scripts/deploy_cli.ps1` to build (via WSL), upload the zip, run a smoke invoke, and tail logs.
- Full stack: Run `npx serverless deploy` from `backend/create-gallery` to deploy the small CloudFormation stack for this service.

Local deploy helper (Windows)

If you're on Windows and want a single CLI command to build (via WSL), upload the zip to the Lambda, invoke a smoke test, and tail logs, use the PowerShell helper:

```powershell
# From this service folder:
.\scripts\deploy_cli.ps1 -FunctionName "mylg-v12-create-gallery-dev" -Region "us-west-2"
```

Notes:
- The script prefers WSL for building native Python dependencies. If WSL isn't available it will attempt to run the build script via bash which may fail on native Windows.
- Requires AWS CLI v2 configured with credentials that can update Lambda code and read logs.
- The default Lambda function name is `mylg-v12-create-gallery-dev`. Pass `-FunctionName` to override if your function has a different name.

Docker build option

If you don't have WSL or prefer Docker, the helper supports a Docker build path. This runs a `python:3.9-slim-bullseye` container, installs system deps and the Python packages into a package layout, zips the artifact, and uploads it.

Example (use from `backend/create-gallery`):

```powershell
# Build and deploy using Docker
.\scripts\deploy_cli.ps1 -UseDocker
```

Notes:
- Docker must be installed and running on your machine.
- The Docker build installs OS libs that PyMuPDF may require (libgl1, libxrender1, libxext6, fontconfig).

Troubleshooting
- If your Lambda logs show ImportError for PyMuPDF, ensure you built the native wheels in a Linux environment that matches AWS Lambda (glibc/x86_64). Use WSL or a Linux CI runner.
- Prefer CI-driven builds (GitHub Actions or AWS CodeBuild) to produce the zip or publish a Lambda Layer so developers on Windows don't need to produce .so files locally.

