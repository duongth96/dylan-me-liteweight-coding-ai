#!/bin/sh

/init-users.sh

# Chạy ollama serve ở background
ollama serve &

# Chạy ttyd và ép buộc sử dụng bash với quyền ghi
# -W: Cho phép nhập liệu
# -p 7681: Cổng truy cập
exec ttyd -W -c $CRE_USER:$CRE_PASSWORD -a -s 3 -t titleFixed=/bin/sh -t rendererType=webgl -t disableLeaveAlert=true /autologin.sh
