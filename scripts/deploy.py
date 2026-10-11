import os
import tarfile
import paramiko

dist_dir = "dist"
archive_path = "dist.tar.gz"

print("1. 正在压缩 dist 目录...")
with tarfile.open(archive_path, "w:gz") as tar:
    for root, dirs, files in os.walk(dist_dir):
        for file in files:
            full_path = os.path.join(root, file)
            rel_path = os.path.relpath(full_path, dist_dir)
            tar.add(full_path, arcname=rel_path)

file_size_mb = os.path.getsize(archive_path) / (1024 * 1024)
print(f"压缩包大小: {file_size_mb:.2f} MB")

print("2. 正在连接服务器 39.105.13.58...")
ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect("39.105.13.58", port=22, username="root", password="@Flzx3000c", timeout=15)

print("3. 正在上传更新包至服务器...")
sftp = ssh.open_sftp()
sftp.put(archive_path, "/tmp/dist.tar.gz")
sftp.close()

print("4. 正在解压并更新站点...")
cmd = """
rm -rf /var/www/astro/*
tar -xzf /tmp/dist.tar.gz -C /var/www/astro
rm -f /tmp/dist.tar.gz
chmod -R 755 /var/www/astro
"""
stdin, stdout, stderr = ssh.exec_command(cmd)
stdout.channel.recv_exit_status()

ssh.close()
if os.path.exists(archive_path):
    os.remove(archive_path)

print("部署完成！请访问: http://39.105.13.58")
