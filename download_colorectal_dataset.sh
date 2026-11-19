#!/bin/bash
set -euo pipefail

ROOT="$HOME/Desktop/CYTOGENIX"
DATA="$ROOT/data"
DOWNLOADS="$DATA/downloads"
TRAIN_DIR="$DATA/datasets/NCT-CRC-HE-100K"
VAL_DIR="$DATA/validation/CRC-VAL-HE-7K"

mkdir -p "$DOWNLOADS" "$TRAIN_DIR" "$VAL_DIR"

echo "=========================================="
echo " CYTOGENIX - COLORECTAL DATASET INSTALLER"
echo "=========================================="

AVAILABLE_KB=$(df -Pk "$ROOT" | awk 'NR==2 {print $4}')
if [ "$AVAILABLE_KB" -lt 41943040 ]; then
    echo "ERROR: Less than 40 GB free. Please free up disk space."
    exit 1
fi

download_and_verify() {
    local NAME="$1"
    local URL="$2"
    local EXPECTED_MD5="$3"
    local PART="$DOWNLOADS/$NAME.part"
    local FINAL="$DOWNLOADS/$NAME"

    if [ -f "$FINAL" ]; then
        ACTUAL=$(md5 -q "$FINAL")
        if [ "$ACTUAL" = "$EXPECTED_MD5" ]; then
            echo "Already downloaded and verified: $NAME"
            return
        fi
        echo "Existing archive failed verification. Re-downloading."
        rm -f "$FINAL"
    fi

    echo ""
    echo "Downloading: $NAME"
    echo "This may take some time. Keep this Terminal open."

    curl -fL --retry 5 --retry-delay 5 -C - \
        -o "$PART" "$URL"

    ACTUAL=$(md5 -q "$PART")
    if [ "$ACTUAL" != "$EXPECTED_MD5" ]; then
        echo "ERROR: Checksum mismatch for $NAME."
        echo "The partial file has been retained for investigation."
        exit 1
    fi

    mv "$PART" "$FINAL"
    echo "Verified successfully: $NAME"
}

download_and_verify \
    "NCT-CRC-HE-100K.zip" \
    "https://zenodo.org/records/1214456/files/NCT-CRC-HE-100K.zip?download=1" \
    "6fd702d11df6292bc054397ae038a464"

download_and_verify \
    "CRC-VAL-HE-7K.zip" \
    "https://zenodo.org/records/1214456/files/CRC-VAL-HE-7K.zip?download=1" \
    "2fd1651b4f94ebd818ebf90ad2b6ce06"

echo ""
echo "Checking ZIP archive integrity..."
unzip -tq "$DOWNLOADS/NCT-CRC-HE-100K.zip"
unzip -tq "$DOWNLOADS/CRC-VAL-HE-7K.zip"

if [ ! -f "$TRAIN_DIR/.extraction_complete" ]; then
    echo ""
    echo "Extracting training dataset..."
    unzip -q "$DOWNLOADS/NCT-CRC-HE-100K.zip" -d "$TRAIN_DIR"
    touch "$TRAIN_DIR/.extraction_complete"
else
    echo "Training dataset already extracted."
fi

if [ ! -f "$VAL_DIR/.extraction_complete" ]; then
    echo ""
    echo "Extracting independent validation dataset..."
    unzip -q "$DOWNLOADS/CRC-VAL-HE-7K.zip" -d "$VAL_DIR"
    touch "$VAL_DIR/.extraction_complete"
else
    echo "Validation dataset already extracted."
fi

echo ""
echo "=========================================="
echo " DATASET DOWNLOAD AND EXTRACTION COMPLETE"
echo "=========================================="

echo ""
echo "Training folder:"
du -sh "$TRAIN_DIR"

echo ""
echo "Validation folder:"
du -sh "$VAL_DIR"

echo ""
echo "Training class folders:"
find "$TRAIN_DIR" -type d -mindepth 1 -maxdepth 2

echo ""
echo "Remaining disk space:"
df -h "$ROOT"

echo ""
echo "IMPORTANT: No model has been trained yet."
echo "Next: connect the independent validation data"
echo "to the CYTOGENIX training and evaluation pipeline."
