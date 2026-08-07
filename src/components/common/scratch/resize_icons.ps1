Add-Type -AssemblyName System.Drawing

function Create-SquircleIcon {
    param (
        [string]$sourcePath,
        [string]$destPath,
        [int]$size
    )

    # Load source image
    $srcImg = [System.Drawing.Image]::FromFile($sourcePath)
    
    # Create target bitmap
    $bmp = New-Object System.Drawing.Bitmap($size, $size)
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    
    # Set high-quality render settings
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
    
    # Clear transparent
    $g.Clear([System.Drawing.Color]::Transparent)
    
    # Define rounded rect path for squircle (radius is 33% of size)
    $r = $size * 0.33
    $path = New-Object System.Drawing.Drawing2D.GraphicsPath
    $path.AddArc(0, 0, $r, $r, 180, 90)
    $path.AddArc(($size - $r - 1), 0, $r, $r, 270, 90)
    $path.AddArc(($size - $r - 1), ($size - $r - 1), $r, $r, 0, 90)
    $path.AddArc(0, ($size - $r - 1), $r, $r, 90, 90)
    $path.CloseAllFigures()
    
    # Clip drawing to the squircle path
    $g.SetClip($path)
    
    # Draw source image scaled to destination size
    $g.DrawImage($srcImg, 0, 0, $size, $size)
    
    # Clean up graphics and save
    $g.Dispose()
    $srcImg.Dispose()
    
    # Save as PNG
    $bmp.Save($destPath, [System.Drawing.Imaging.ImageFormat]::Png)
    $bmp.Dispose()
}

$logoPath = "C:\Users\niger\Downloads\logo.png"
$resDir = "C:\Users\niger\Desktop\Antigrav projects\Finance-ally\android\app\src\main\res"

$sizes = @{
    "mipmap-mdpi"    = 48
    "mipmap-hdpi"    = 72
    "mipmap-xhdpi"   = 96
    "mipmap-xxhdpi"  = 144
    "mipmap-xxxhdpi" = 192
}

foreach ($folder in $sizes.Keys) {
    $size = $sizes[$folder]
    $folderPath = Join-Path $resDir $folder
    
    if (Test-Path $folderPath) {
        Write-Host "Generating squircle icons for $folder ($size x $size)..."
        
        # Overwrite standard launcher
        Create-SquircleIcon -sourcePath $logoPath -destPath (Join-Path $folderPath "ic_launcher.png") -size $size
        
        # Overwrite round launcher
        Create-SquircleIcon -sourcePath $logoPath -destPath (Join-Path $folderPath "ic_launcher_round.png") -size $size
        
        # Overwrite adaptive foreground
        Create-SquircleIcon -sourcePath $logoPath -destPath (Join-Path $folderPath "ic_launcher_foreground.png") -size $size
    }
}

# Generate splash logo (using 192px size for standard splash display)
$splashPng = Join-Path $resDir "drawable\splash.png"
Write-Host "Generating squircle splash logo..."
Create-SquircleIcon -sourcePath $logoPath -destPath $splashPng -size 192

Write-Host "Icon generation completed successfully!"
