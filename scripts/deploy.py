import os
import sys
import getpass
import tarfile

try:
    import paramiko
except ImportError:
    print("❌ 缺少 paramiko 库，请先安装: pip install paramiko")
    sys.exit(1)


def load_env_file(filepath=".env"):
    """简易解析 .env 文件（避免强制依赖 python-dotenv）"""
    if not os.path.exists(filepath):
        return
    with open(filepath, "r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, val = line.split("=", 1)
            key = key.strip()
            val = val.strip().strip("'\"")
            if key and key not in os.environ:
                os.environ[key] = val


# 加载本地 .env（如果存在）
load_env_file()

dist_dir = "dist"
archive_path = "dist.tar.gz"

if not os.path.exists(dist_dir):
    print(f"❌ 目录 '{dist_dir}' 不存在，请先执行 npm run build 构建站点。")
    sys.exit(1)

# 读取配置（优先环境变量，其次默认值）
host = os.environ.get("DEPLOY_HOST", "39.105.13.58")
port = int(os.environ.get("DEPLOY_PORT", "22"))
username = os.environ.get("DEPLOY_USER", "root")
password = os.environ.get("DEPLOY_PASSWORD")
key_file = os.environ.get("DEPLOY_KEY_FILE")
target_dir = os.environ.get("DEPLOY_TARGET_DIR", "/var/www/astro")

# 凭据检查与交互式回退
if not password and not key_file:
    print(f"⚠️  提示：未设置 DEPLOY_PASSWORD 或 DEPLOY_KEY_FILE 环境变量。")
    if sys.stdin.isatty():
        password = getpass.getpass(f"🔑 请输入服务器 {username}@{host} 的密码: ")
    else:
        print("❌ 错误：非交互环境下请在 .env 或环境变量中指定 DEPLOY_PASSWORD 或 DEPLOY_KEY_FILE。")
        sys.exit(1)

try:
    print("1. 正在压缩 dist 目录...")
    with tarfile.open(archive_path, "w:gz") as tar:
        for root, dirs, files in os.walk(dist_dir):
            for file in files:
                full_path = os.path.join(root, file)
                rel_path = os.path.relpath(full_path, dist_dir)
                tar.add(full_path, arcname=rel_path)

    file_size_mb = os.path.getsize(archive_path) / (1024 * 1024)
    print(f"   压缩包大小: {file_size_mb:.2f} MB")

    print(f"2. 正在连接服务器 {username}@{host}:{port} ...")
    ssh = paramiko.SSHClient()
    ssh.load_system_host_keys()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())

    connect_kwargs = {
        "hostname": host,
        "port": port,
        "username": username,
        "timeout": 15,
    }
    if key_file:
        connect_kwargs["key_filename"] = os.path.expanduser(key_file)
    if password:
        connect_kwargs["password"] = password

    ssh.connect(**connect_kwargs)

    print("3. 正在上传更新包至服务器 /tmp/dist.tar.gz ...")
    sftp = ssh.open_sftp()
    sftp.put(archive_path, "/tmp/dist.tar.gz")
    sftp.close()

    print(f"4. 正在解压并更新站点至 {target_dir} ...")
    remote_script = f"""
    rm -rf {target_dir}/*
    tar -xzf /tmp/dist.tar.gz -C {target_dir}
    rm -f /tmp/dist.tar.gz
    chmod -R 755 {target_dir}
    """
    stdin, stdout, stderr = ssh.exec_command(remote_script)
    exit_status = stdout.channel.recv_exit_status()

    if exit_status != 0:
        err = stderr.read().decode("utf-8", errors="replace")
        print(f"❌ 远程解压执行失败 (code {exit_status}):\n{err}")
        sys.exit(exit_status)

    ssh.close()
    print(f"🎉 部署成功！请访问: http://{host}")

finally:
    if os.path.exists(archive_path):
        os.remove(archive_path)
