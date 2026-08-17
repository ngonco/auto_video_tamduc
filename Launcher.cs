using System;
using System.Diagnostics;
using System.IO;
using System.Net;
using System.Threading;
using System.Windows.Forms;
using System.Drawing;

namespace AutoVideoTamDuc
{
    static class Program
    {
        private static Process serverProcess;
        private static NotifyIcon trayIcon;

        [STAThread]
        static void Main()
        {
            Application.EnableVisualStyles();
            Application.SetCompatibleTextRenderingDefault(false);

            string appDir = AppDomain.CurrentDomain.BaseDirectory;
            Directory.SetCurrentDirectory(appDir);

            // Kiểm tra xem server có đang chạy sẵn không
            bool isAlreadyRunning = CheckUrl("http://localhost:5173/");

            if (!isAlreadyRunning)
            {
                // Khởi động npm run dev ở chế độ ngầm
                ProcessStartInfo psi = new ProcessStartInfo
                {
                    FileName = "cmd.exe",
                    Arguments = "/c npm run dev",
                    WorkingDirectory = appDir,
                    CreateNoWindow = true,
                    UseShellExecute = false,
                    WindowStyle = ProcessWindowStyle.Hidden
                };

                try
                {
                    serverProcess = Process.Start(psi);
                }
                catch (Exception ex)
                {
                    MessageBox.Show("Không thể khởi động npm run dev: " + ex.Message, "Lỗi Auto Video Tâm Đức", MessageBoxButtons.OK, MessageBoxIcon.Error);
                    return;
                }

                // Đợi server sẵn sàng tối đa 12 giây
                int attempts = 0;
                while (attempts < 24)
                {
                    Thread.Sleep(500);
                    if (CheckUrl("http://localhost:5173/"))
                    {
                        break;
                    }
                    attempts++;
                }
            }

            // Mở trình duyệt mặc định vào ứng dụng
            try
            {
                Process.Start("http://localhost:5173/");
            }
            catch
            {
                Process.Start(new ProcessStartInfo("cmd", "/c start http://localhost:5173/") { CreateNoWindow = true });
            }

            // Tạo Tray Icon ở góc phải màn hình để quản lý
            trayIcon = new NotifyIcon
            {
                Icon = SystemIcons.Application,
                Text = "Auto Video Tâm Đức (Đang chạy)",
                Visible = true
            };

            ContextMenu menu = new ContextMenu();
            menu.MenuItems.Add("Mở Giao Diện Web", (s, e) => Process.Start("http://localhost:5173/"));
            menu.MenuItems.Add("-");
            menu.MenuItems.Add("Thoát Ứng Dụng", (s, e) => ExitApp());

            trayIcon.ContextMenu = menu;
            trayIcon.DoubleClick += (s, e) => Process.Start("http://localhost:5173/");

            trayIcon.ShowBalloonTip(3000, "Auto Video Tâm Đức", "Ứng dụng đã sẵn sàng tại http://localhost:5173/", ToolTipIcon.Info);

            Application.Run();
        }

        private static bool CheckUrl(string url)
        {
            try
            {
                HttpWebRequest request = (HttpWebRequest)WebRequest.Create(url);
                request.Timeout = 800;
                request.Method = "HEAD";
                using (HttpWebResponse response = (HttpWebResponse)request.GetResponse())
                {
                    return response.StatusCode == HttpStatusCode.OK;
                }
            }
            catch
            {
                return false;
            }
        }

        private static void ExitApp()
        {
            if (trayIcon != null)
            {
                trayIcon.Visible = false;
                trayIcon.Dispose();
            }

            if (serverProcess != null && !serverProcess.HasExited)
            {
                try
                {
                    // Kill process tree
                    Process.Start(new ProcessStartInfo("taskkill", string.Format("/F /T /PID {0}", serverProcess.Id)) { CreateNoWindow = true });
                }
                catch { }
            }

            Application.Exit();
        }
    }
}
