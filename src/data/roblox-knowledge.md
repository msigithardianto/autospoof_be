# Referensi error umum Roblox (Luau)

## Error pesan Output
- `attempt to index nil with 'X'` : variabel di kiri titik bernilai nil. Penyebab: path salah, objek belum ter-load/replicate (pakai :WaitForChild), :FindFirstChild mengembalikan nil, player.Character nil (belum spawn / sudah mati), instance sudah di-Destroy. Cek variabel mana yang nil, jangan langsung menambah `if`.
- `X is not a valid member of Y` : nama salah/huruf besar-kecil beda, objek belum ada saat kode jalan, atau dilihat dari sisi yang salah (ServerStorage & ServerScriptService TIDAK terlihat oleh client). Solusi: WaitForChild, cek nama, taruh di ReplicatedStorage jika client butuh.
- `Infinite yield possible on 'X:WaitForChild("Y")'` : Y tidak pernah muncul di parent itu dari sisi script tersebut (nama salah, dibuat di server tapi tidak di-replicate, ada di ServerStorage, atau parent salah). Beri timeout: WaitForChild("Y", 5).
- `attempt to call a nil value` : memanggil fungsi yang tidak ada / salah ketik / ModuleScript tidak me-return fungsi itu. `attempt to call a table value` : module me-return table, panggil field-nya.
- `attempt to perform arithmetic (add) on nil and number` : salah satu operand nil. `attempt to compare number < nil/string` : tipe berbeda (sering karena argumen RemoteEvent salah urutan atau value dari TextBox masih string: pakai tonumber()).
- `Requested module was required recursively` : require melingkar antar ModuleScript. `Requested module experienced an error while loading` : ada error di dalam module itu sendiri.
- `Script timeout: exhausted allowed execution time` : loop tanpa yield. Tambahkan task.wait().
- `Workspace.Part.Script:5: Expected identifier...` / syntax error : cek tanda kurung, `end`, `then`, `do` yang kurang.

## Client-Server
- LocalScript hanya jalan di PlayerGui, Backpack, karakter player, ReplicatedFirst, atau Script dengan RunContext = Client. LocalScript di Workspace/ServerScriptService tidak jalan.
- RemoteEvent: server menerima `OnServerEvent(function(player, ...))` (argumen pertama SELALU player). Client menerima `OnClientEvent(function(...))` tanpa player. Server kirim: `FireClient(player, ...)` / `FireAllClients(...)`.
- Yang tidak bisa dikirim lewat Remote: function, metatable (hilang), instance yang tidak ter-replicate (jadi nil), table campuran key array+dictionary (struktur rusak). Selalu validasi input dari client di server (tipe, rentang, kepemilikan); jangan percaya harga/jumlah dari client.
- RemoteFunction: jangan InvokeClient dari server (bisa hang/exploit).
- Perubahan di client tidak ter-replicate ke server (efek hanya lokal). Ubah data game dari server.

## DataStore
- Hanya bisa menyimpan tipe dasar: number, string, boolean, table (array ATAU dictionary dengan key string, jangan campur). Vector3/CFrame/Color3/Instance TIDAK bisa; simpan sebagai angka/table ({x=,y=,z=}).
- Selalu bungkus pcall (bisa gagal/throttle). Gunakan UpdateAsync untuk data penting. Key maks 50 karakter, value maks 4 MB.
- Simpan juga di `game:BindToClose` supaya data tidak hilang saat server mati. `PlayerRemoving`: Character bisa sudah nil.
- Di Studio perlu aktifkan Game Settings > Security > "Enable Studio Access to API Services" kalau error akses API.
- Muat data setelah PlayerAdded; jangan simpan sebelum data berhasil dimuat (bisa menimpa data lama dengan kosong).

## Lain-lain
- HttpService: "Http requests are not enabled" -> Game Settings > Security > Allow HTTP Requests. Tidak bisa memanggil domain roblox.com.
- Event Touched menembak berkali-kali: pakai debounce dan cek asal part (player/humanoid).
- Memory leak/lag bertahap tanpa error: koneksi event (Heartbeat, CharacterAdded, dll) tidak di-:Disconnect(), instance tidak di-:Destroy(), loop per-karakter yang menumpuk. Simpan koneksi dan putuskan saat karakter hilang; atau pakai satu loop global.
- PlayerAdded sudah terjadi sebelum script jalan: jalankan juga untuk `Players:GetPlayers()` yang sudah ada.
- CharacterAdded bisa sudah terjadi: cek `player.Character or player.CharacterAdded:Wait()`.
- ScreenGui: `ResetOnSpawn` true membuat UI di-reset saat respawn; UI di StarterGui di-clone ke PlayerGui; ubah UI lewat LocalScript.
- Deprecated: `wait()/spawn()/delay()` -> `task.wait()/task.spawn()/task.delay()`; `:connect` -> `:Connect`; BodyVelocity/BodyPosition -> LinearVelocity/AlignPosition; `Instance.new("Part", parent)` -> set Parent terakhir.
- Fisika: Anchored, CanCollide, NetworkOwnership (SetNetworkOwner) memengaruhi perilaku part; lag/jitter sering karena network ownership.
- Tween: properti tujuan harus ada & tipe cocok; tunggu `tween.Completed`.
