Option Explicit

Dim shell
Dim command

Set shell = CreateObject("WScript.Shell")
command = "powershell.exe -NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File ""H:\Dev\MyApps\unitflip\scripts\start-field-cloudflare.ps1"""

WScript.Quit shell.Run(command, 0, True)
