@echo off
:: Run this file as Administrator to fix Clerk login (clock skew)
echo Syncing Windows time with time.windows.com ...
net start w32time
w32tm /config /manualpeerlist:"time.windows.com,0x1" /syncfromflags:manual /reliable:yes /update
w32tm /resync /force
echo.
echo Done. Now:
echo 1) Close all browser tabs for localhost:3000
echo 2) Clear cookies for localhost
echo 3) Restart npm run dev
echo 4) Open http://localhost:3000/sign-in in a private window
pause
