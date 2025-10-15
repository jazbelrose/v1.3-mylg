param(
    [string]$FunctionName = "mylg-v12-create-gallery-dev",
    [string]$Region = "us-west-2",
    [string]$ZipPath = ".serverless/createGalleryFunction.zip"
)

Set-Location $PSScriptRoot\..\

Write-Host "Deploying ZIP: $ZipPath to Lambda function: $FunctionName in region $Region"

if(-not (Test-Path $ZipPath)){
    Write-Error "Zip not found: $ZipPath"
    Write-Host "If you haven't built the zip, follow the README in this folder to build Linux-native PyMuPDF (WSL/Docker) and create the zip at .serverless/createGalleryFunction.zip"
    exit 2
}

$zipFull = (Resolve-Path $ZipPath).Path
Get-Item $zipFull | Select-Object Name, Length | Format-List

Write-Host "Updating function code..."
aws lambda update-function-code --function-name $FunctionName --zip-file "fileb://$zipFull" --region $Region
if($LASTEXITCODE -ne 0){ Write-Error "update-function-code failed with exit code $LASTEXITCODE"; exit $LASTEXITCODE }

Write-Host "Ensuring handler is set to lambda_function.lambda_handler"
aws lambda update-function-configuration --function-name $FunctionName --handler lambda_function.lambda_handler --region $Region
if($LASTEXITCODE -ne 0){ Write-Error "update-function-configuration failed with exit code $LASTEXITCODE"; exit $LASTEXITCODE }

# Invoke a quick smoke test
Write-Host "Invoking function (smoke test)..."
$payload = '{"smoke":"ping"}'
aws lambda invoke --function-name $FunctionName --payload $payload out.json --cli-binary-format raw-in-base64-out --region $Region
if($LASTEXITCODE -ne 0){ Write-Error "invoke failed with exit code $LASTEXITCODE"; exit $LASTEXITCODE }

Write-Host "---- INVOKE OUTPUT ----"
Get-Content out.json -Raw | Write-Host
Write-Host "---- END OUTPUT ----"

Write-Host "Tailing recent logs (last 5 minutes)"
aws logs tail /aws/lambda/$FunctionName --since 5m --limit 50 --region $Region

Write-Host "Done. If you see ImportError in logs, check that the zip contains the 'python/' folder with the built shared libraries and that the handler is present at the zip root as lambda_function.py"
