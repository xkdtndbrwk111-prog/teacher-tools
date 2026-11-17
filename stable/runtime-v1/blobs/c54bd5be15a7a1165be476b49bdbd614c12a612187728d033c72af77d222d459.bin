# Lists sound outputs and sets the Windows default one. Windows has no public call for setting it, so this uses the same inner one sound switchers use.
$script:TTSpeakerSource = @'
using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;
public class TTSpeakerDevice { public string Id; public string Name; public bool IsDefault; }
[StructLayout(LayoutKind.Sequential)] public struct TTPropertyKey { public Guid fmtid; public int pid; }
[StructLayout(LayoutKind.Explicit)] public struct TTPropVariant { [FieldOffset(0)] public short vt; [FieldOffset(8)] public IntPtr pointer; [FieldOffset(16)] public IntPtr filler; }
[ComImport, Guid("886d8eeb-8cf2-4446-8d02-cdba1dbdcf99"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface ITTPropertyStore { [PreserveSig] int GetCount(out int count); [PreserveSig] int GetAt(int index, out TTPropertyKey key); [PreserveSig] int GetValue(ref TTPropertyKey key, out TTPropVariant value); }
[ComImport, Guid("D666063F-1587-4E43-81F1-B948E807363F"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface ITTDevice { [PreserveSig] int Activate(ref Guid iid, int context, IntPtr parameters, [MarshalAs(UnmanagedType.IUnknown)] out object result); [PreserveSig] int OpenPropertyStore(int access, out ITTPropertyStore store); [PreserveSig] int GetId([MarshalAs(UnmanagedType.LPWStr)] out string id); [PreserveSig] int GetState(out int state); }
[ComImport, Guid("0BD7A1BE-7A1A-44DB-8397-CC5392387B5E"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface ITTDeviceCollection { [PreserveSig] int GetCount(out int count); [PreserveSig] int Item(int index, out ITTDevice device); }
[ComImport, Guid("A95664D2-9614-4F35-A746-DE8DB63617E6"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface ITTDeviceEnumerator { [PreserveSig] int EnumAudioEndpoints(int flow, int stateMask, out ITTDeviceCollection devices); [PreserveSig] int GetDefaultAudioEndpoint(int flow, int role, out ITTDevice device); }
[ComImport, Guid("BCDE0395-E52F-467C-8E3D-C4579291692E")] class TTDeviceEnumerator { }
[ComImport, Guid("f8679f50-850a-41cf-9c72-430f290290c8"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface ITTPolicyConfig {
 [PreserveSig] int GetMixFormat(); [PreserveSig] int GetDeviceFormat(); [PreserveSig] int ResetDeviceFormat(); [PreserveSig] int SetDeviceFormat(); [PreserveSig] int GetProcessingPeriod(); [PreserveSig] int SetProcessingPeriod(); [PreserveSig] int GetShareMode(); [PreserveSig] int SetShareMode(); [PreserveSig] int GetPropertyValue(); [PreserveSig] int SetPropertyValue();
 [PreserveSig] int SetDefaultEndpoint([MarshalAs(UnmanagedType.LPWStr)] string id, int role);
}
[ComImport, Guid("870af99c-171d-4f9e-af0d-e63df40c2bc9")] class TTPolicyConfig { }
public static class TTSpeakers {
 [DllImport("ole32.dll")] static extern int PropVariantClear(ref TTPropVariant value);
 static void Check(int hr) { if (hr != 0) Marshal.ThrowExceptionForHR(hr); }
 static string NameOf(ITTDevice device) {
  ITTPropertyStore store; Check(device.OpenPropertyStore(0, out store));
  TTPropertyKey key = new TTPropertyKey(); key.fmtid = new Guid("a45c254e-df1c-4efd-8020-67d146a850e0"); key.pid = 14;
  TTPropVariant value; Check(store.GetValue(ref key, out value));
  string name = value.vt == 31 ? Marshal.PtrToStringUni(value.pointer) : "";
  PropVariantClear(ref value);
  return name;
 }
 public static List<TTSpeakerDevice> All() {
  ITTDeviceEnumerator all = (ITTDeviceEnumerator)new TTDeviceEnumerator();
  string current = null; ITTDevice main;
  if (all.GetDefaultAudioEndpoint(0, 1, out main) == 0 && main != null) Check(main.GetId(out current));
  ITTDeviceCollection devices; Check(all.EnumAudioEndpoints(0, 1, out devices));
  int count; Check(devices.GetCount(out count));
  List<TTSpeakerDevice> result = new List<TTSpeakerDevice>();
  for (int i = 0; i < count; i++) {
   ITTDevice device; Check(devices.Item(i, out device));
   string id; Check(device.GetId(out id));
   TTSpeakerDevice item = new TTSpeakerDevice(); item.Id = id; item.Name = NameOf(device); item.IsDefault = id == current;
   result.Add(item);
  }
  return result;
 }
 public static void Set(string id) {
  ITTPolicyConfig policy = (ITTPolicyConfig)new TTPolicyConfig();
  for (int role = 0; role < 3; role++) Check(policy.SetDefaultEndpoint(id, role));
 }
}
[ComImport, Guid("5CDF2C82-841E-4546-9722-0CF74078229A"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface ITTEndpointVolume {
 [PreserveSig] int RegisterControlChangeNotify(IntPtr notify); [PreserveSig] int UnregisterControlChangeNotify(IntPtr notify);
 [PreserveSig] int GetChannelCount(out uint count); [PreserveSig] int SetMasterVolumeLevel(float db, ref Guid context);
 [PreserveSig] int SetMasterVolumeLevelScalar(float level, ref Guid context); [PreserveSig] int GetMasterVolumeLevel(out float db);
 [PreserveSig] int GetMasterVolumeLevelScalar(out float level); [PreserveSig] int SetChannelVolumeLevel(uint channel, float db, ref Guid context);
 [PreserveSig] int SetChannelVolumeLevelScalar(uint channel, float level, ref Guid context); [PreserveSig] int GetChannelVolumeLevel(uint channel, out float db);
 [PreserveSig] int GetChannelVolumeLevelScalar(uint channel, out float level); [PreserveSig] int SetMute([MarshalAs(UnmanagedType.Bool)] bool mute, ref Guid context);
 [PreserveSig] int GetMute([MarshalAs(UnmanagedType.Bool)] out bool mute);
}
// The volume of whichever speaker Windows is using now.
public static class TTVolume {
 static void Check(int hr) { if (hr != 0) Marshal.ThrowExceptionForHR(hr); }
 static ITTEndpointVolume Endpoint() {
  ITTDeviceEnumerator all = (ITTDeviceEnumerator)new TTDeviceEnumerator(); ITTDevice device;
  Check(all.GetDefaultAudioEndpoint(0, 1, out device));
  Guid iid = typeof(ITTEndpointVolume).GUID; object result;
  Check(device.Activate(ref iid, 23, IntPtr.Zero, out result));
  return (ITTEndpointVolume)result;
 }
 public static float Level() { float v; Check(Endpoint().GetMasterVolumeLevelScalar(out v)); return v; }
 public static bool Muted() { bool m; Check(Endpoint().GetMute(out m)); return m; }
 public static void SetLevel(float v) { Guid g = Guid.Empty; Check(Endpoint().SetMasterVolumeLevelScalar(Math.Max(0f, Math.Min(1f, v)), ref g)); }
 public static void SetMute(bool m) { Guid g = Guid.Empty; Check(Endpoint().SetMute(m, ref g)); }
}
'@
function Initialize-TTSpeakers { if (-not ('TTSpeakers' -as [type])) { Add-Type -TypeDefinition $script:TTSpeakerSource } }
function Get-TTSpeakers {
 Initialize-TTSpeakers
 @([TTSpeakers]::All() | ForEach-Object { [pscustomobject]@{ id=$_.Id; name=$_.Name; current=[bool]$_.IsDefault } })
}
function Get-TTVolume {
 Initialize-TTSpeakers
 [pscustomobject]@{ level=[math]::Round([TTVolume]::Level()*100); muted=[bool][TTVolume]::Muted() }
}
function Set-TTVolume($Level, $Muted) {
 Initialize-TTSpeakers
 if ($null -ne $Level) { [TTVolume]::SetLevel([float]([double]$Level/100)) }
 if ($null -ne $Muted) { [TTVolume]::SetMute([bool]$Muted) }
}
function Set-TTSpeaker([string]$Id) {
 Initialize-TTSpeakers
 if (-not (@(Get-TTSpeakers) | Where-Object { $_.id -eq $Id })) { throw 'Speaker not found' }
 [TTSpeakers]::Set($Id)
}
