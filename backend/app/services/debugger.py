import ctypes
from ctypes import wintypes

# Windows Constants
PROCESS_ALL_ACCESS = 0x1F0FFF


def read_process_memory(pid, address, size=256):
    # Open the target process
    process_handle = ctypes.windll.kernel32.OpenProcess(PROCESS_ALL_ACCESS, False, pid)
    buffer = ctypes.create_string_buffer(size)
    bytes_read = wintypes.SIZE_T()

    # Read the raw hex from the app's RAM
    if ctypes.windll.kernel32.ReadProcessMemory(
        process_handle, address, buffer, size, ctypes.byref(bytes_read)
    ):
        return buffer.raw
    return None
