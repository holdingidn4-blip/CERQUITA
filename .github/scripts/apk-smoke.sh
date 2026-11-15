#!/usr/bin/env bash
# Instala el APK en el emulador, lo abre y comprueba que no se cierre al iniciar.
set -uo pipefail
PKG=pe.cerquita.app
APK=$(ls apk/*.apk | head -1)
mkdir -p smoke

echo "ABIs del emulador: $(adb shell getprop ro.product.cpu.abilist | tr -d '\r')"
adb install -r "$APK" || { echo "SMOKE: no se pudo instalar el APK"; exit 1; }
adb logcat -c
adb shell monkey -p "$PKG" -c android.intent.category.LAUNCHER 1 >/dev/null
sleep 45
adb exec-out screencap -p > smoke/01-arranque.png

adb logcat -d > smoke/logcat.txt
echo "--- errores en logcat ---"
grep -E "FATAL EXCEPTION|AndroidRuntime: |ReactNativeJS: .*[Ee]rror" smoke/logcat.txt | head -40 || true

echo "--- textos en pantalla ---"
adb shell uiautomator dump /sdcard/ui.xml >/dev/null 2>&1 && adb pull /sdcard/ui.xml smoke/ui.xml >/dev/null 2>&1
grep -o 'text="[^"]*"' smoke/ui.xml 2>/dev/null | grep -v 'text=""' | head -40

PID=$(adb shell pidof "$PKG" | tr -d '\r')
if [ -z "$PID" ]; then
  echo "SMOKE: FALLA · la app no está corriendo (se cerró al iniciar)"
  exit 1
fi
if ! grep -q "Recibir código por SMS" smoke/ui.xml 2>/dev/null; then
  echo "SMOKE: FALLA · la app corre (pid $PID) pero no muestra la pantalla de ingreso"
  exit 1
fi
echo "SMOKE: OK · la app abre y muestra la pantalla de ingreso (pid $PID)"
