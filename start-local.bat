@echo off
cd /d "%~dp0"
python runner\serve.py
if errorlevel 1 pause
