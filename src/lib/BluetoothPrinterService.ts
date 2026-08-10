/**
 * BluetoothPrinterService.ts
 * Service & ESC/POS Formatter for 57mm Thermal Printers via Web Bluetooth API.
 */

export interface PrinterConnectionState {
  isConnected: boolean;
  deviceName: string | null;
  status: 'disconnected' | 'connecting' | 'connected' | 'error';
  errorMessage?: string;
}

export interface PrintReceiptData {
  title?: string;
  subtitle?: string;
  typeHeader?: string;
  id?: string;
  unit?: string;
  recipient?: string;
  time?: string;
  packingType?: string;
  batchNo?: string;
  sterilDate?: string;
  expDate?: string;
  packingDate?: string;
  timeSteril?: string;
  items?: { name: string; qty: number; checked?: boolean }[];
  operator?: string;
  notes?: string[];
  qrCode?: string;
  barcode1D?: string;
  isSet?: boolean;
  hideNoteAndTtd?: boolean;
}

class BluetoothPrinterService {
  private static instance: BluetoothPrinterService;

  public static getInstance(): BluetoothPrinterService {
    if (!BluetoothPrinterService.instance) {
      BluetoothPrinterService.instance = bluetoothPrinterService;
    }
    return BluetoothPrinterService.instance;
  }
  private device: BluetoothDevice | null = null;
  private server: BluetoothRemoteGATTServer | null = null;
  private printCharacteristic: BluetoothRemoteGATTCharacteristic | null = null;
  private listeners: Array<(state: PrinterConnectionState) => void> = [];

  private currentState: PrinterConnectionState = {
    isConnected: false,
    deviceName: null,
    status: 'disconnected'
  };

  constructor() {
    // Attempt auto restore last device name from localStorage if available
    const savedName = localStorage.getItem('bt_printer_name');
    if (savedName) {
      this.currentState.deviceName = savedName;
    }
  }

  public subscribe(callback: (state: PrinterConnectionState) => void) {
    this.listeners.push(callback);
    callback(this.currentState);
    return () => {
      this.listeners = this.listeners.filter(l => l !== callback);
    };
  }

  private updateState(newState: Partial<PrinterConnectionState>) {
    this.currentState = { ...this.currentState, ...newState };
    this.listeners.forEach(cb => cb(this.currentState));
  }

  public getState(): PrinterConnectionState {
    return { ...this.currentState };
  }

  public isBluetoothSupported(): boolean {
    return typeof window !== 'undefined' && 'bluetooth' in navigator;
  }

  /**
   * Scans and connects to a Web Bluetooth 57mm ESC/POS printer
   */
  public async scanAndConnect(): Promise<boolean> {
    if (!this.isBluetoothSupported()) {
      const msg = "Browser Anda tidak mendukung Web Bluetooth API. Gunakan Chrome di PC / Android.";
      this.updateState({ status: 'error', errorMessage: msg });
      alert(msg);
      return false;
    }

    this.updateState({ status: 'connecting', errorMessage: undefined });

    try {
      let selectedDevice: BluetoothDevice;

      try {
        selectedDevice = await navigator.bluetooth.requestDevice({
          acceptAllDevices: true,
          optionalServices: [
            '000018f0-0000-1000-8000-00805f9b34fb',
            'e7810a71-73ae-499d-8c15-faa9aef0c3f2',
            '00001101-0000-1000-8000-00805f9b34fb',
            '0000af00-0000-1000-8000-00805f9b34fb'
          ]
        });
      } catch (reqErr: any) {
        if (reqErr?.name === 'NotFoundError' || reqErr?.message?.includes('cancelled') || reqErr?.message?.includes('chooser')) {
          console.log("Pengguna membatalkan dialog Bluetooth.");
          this.updateState({ status: 'disconnected' });
          return false;
        }
        // Fallback filter
        selectedDevice = await navigator.bluetooth.requestDevice({
          filters: [
            { services: ['000018f0-0000-1000-8000-00805f9b34fb'] },
            { namePrefix: 'MPT' },
            { namePrefix: 'RPP' },
            { namePrefix: 'Bluetooth' },
            { namePrefix: 'Printer' }
          ],
          optionalServices: [
            '000018f0-0000-1000-8000-00805f9b34fb',
            'e7810a71-73ae-499d-8c15-faa9aef0c3f2',
            '00001101-0000-1000-8000-00805f9b34fb'
          ]
        });
      }

      if (!selectedDevice) {
        this.updateState({ status: 'disconnected' });
        return false;
      }

      this.device = selectedDevice;
      this.device.addEventListener('gattserverdisconnected', this.onDisconnected.bind(this));

      const gattServer = await this.device.gatt?.connect();
      if (!gattServer) {
        throw new Error("Gagal terhubung ke GATT server printer.");
      }
      this.server = gattServer;

      // Find primary service and write characteristic
      const services = await this.server.getPrimaryServices();
      let writeChar: BluetoothRemoteGATTCharacteristic | null = null;

      for (const service of services) {
        try {
          const characteristics = await service.getCharacteristics();
          for (const char of characteristics) {
            if (char.properties.write || char.properties.writeWithoutResponse) {
              writeChar = char;
              break;
            }
          }
        } catch (e) {
          console.warn("Skipping unreadable BLE service:", e);
        }
        if (writeChar) break;
      }

      if (!writeChar) {
        throw new Error("Karakteristik pencetakan ESC/POS tidak ditemukan.");
      }

      this.printCharacteristic = writeChar;
      const deviceName = this.device.name || "57mm Thermal Printer";
      localStorage.setItem('bt_printer_name', deviceName);

      this.updateState({
        isConnected: true,
        deviceName: deviceName,
        status: 'connected',
        errorMessage: undefined
      });

      return true;
    } catch (err: any) {
      if (err?.name === 'NotFoundError' || err?.message?.includes('cancelled') || err?.message?.includes('chooser')) {
        this.updateState({ status: 'disconnected' });
        return false;
      }
      console.error("Bluetooth printer connection error:", err);
      this.updateState({
        isConnected: false,
        status: 'error',
        errorMessage: err.message || "Gagal menghubungkan printer."
      });
      return false;
    }
  }

  private onDisconnected() {
    console.warn("Bluetooth printer disconnected.");
    this.server = null;
    this.printCharacteristic = null;
    this.updateState({
      isConnected: false,
      status: 'disconnected'
    });
  }

  public async disconnect(): Promise<void> {
    if (this.device && this.device.gatt?.connected) {
      this.device.gatt.disconnect();
    }
    this.device = null;
    this.server = null;
    this.printCharacteristic = null;
    this.updateState({
      isConnected: false,
      status: 'disconnected',
      deviceName: null
    });
    localStorage.removeItem('bt_printer_name');
  }

  /**
   * Format helper: Fits key-value into exactly 32 columns for 57mm thermal paper
   */
  public formatKeyValue(key: string, value: string, maxCols: number = 32): string {
    const keyStr = `${key.padEnd(12, ' ').substring(0, 12)}: `;
    const availVal = maxCols - keyStr.length;
    let valStr = value || '-';
    if (valStr.length > availVal) {
      valStr = valStr.substring(0, availVal);
    }
    return `${keyStr}${valStr}`;
  }

  /**
   * Builds 57mm formatted receipt template text
   */
  public buildReceiptTemplate(data: PrintReceiptData): string {
    const lines: string[] = [];

    // Header QR
    if (data.qrCode) {
      lines.push(`[[QR]]${data.qrCode}[[/QR]]`);
      lines.push(`[[CENTER]]${data.qrCode}[[/CENTER]]`);
    }

    lines.push(`[[CENTER]]TRACKING ALUR[[/CENTER]]`);

    lines.push(`[[CENTER]]${data.subtitle || 'CSSD - RSUD BENDA'}[[/CENTER]]`);
    lines.push(`--------------------------------`);
    lines.push(data.typeHeader || `BUKTI SERAH`);

    const setName = data.title || (data.items && data.items.length > 0 ? data.items[0].name : 'Hecting Set');
    lines.push(this.formatKeyValue('Nama Item', setName));

    if (data.unit) lines.push(this.formatKeyValue('Instalasi', data.unit));
    if (data.packingType) lines.push(this.formatKeyValue('Jenis Packing', data.packingType));
    if (data.packingDate) lines.push(this.formatKeyValue('Tgl Packing', data.packingDate));
    if (data.timeSteril) lines.push(this.formatKeyValue('Time Steril', data.timeSteril));

    if (data.isSet && data.items && data.items.length > 0) {
      lines.push(`--------------------------------`);
      lines.push(`RINCIAN ISI SET:`);
      lines.push(`                  JML  PR  PS`);

      // Filter out set name from the sub-item list only for sets to avoid duplicate
      const subItems = data.items.filter(i => i.name && i.name.trim().toLowerCase() !== setName.trim().toLowerCase());

      let totalQty = 0;
      if (subItems.length > 0) {
        subItems.forEach(item => {
          const iName = item.name.length > 18 ? item.name.substring(0, 18) : item.name.padEnd(18, ' ');
          const iQty = String(item.qty || (item as any).receivedQty || 1).padStart(3, ' ');
          lines.push(`${iName}${iQty} [  ][  ]`);
          totalQty += Number(item.qty || (item as any).receivedQty || 1);
        });
      } else {
        const iName = setName.length > 18 ? setName.substring(0, 18) : setName.padEnd(18, ' ');
        lines.push(`${iName}  1 [  ][  ]`);
        totalQty = 1;
      }
      lines.push(`JUMLAH          ${String(totalQty).padStart(3, ' ')}`);
    }

    lines.push(`--------------------------------`);
    lines.push(this.formatKeyValue('Petugas CSSD', data.operator || 'Administrator'));

    if (!data.hideNoteAndTtd) {
      lines.push(`--------------------------------`);
      lines.push(`NOTE`);
      lines.push(`- Indikator label tempel di struk ini`);
      lines.push(`  jika alat bekas pakai.`);
      lines.push(`- Struk ini jangan sampai hilang.`);
      lines.push(`--------------------------------`);
      lines.push(`   TTD PENYERAHAN DISTRIBUSI`);
      lines.push(`Petugas Steril     Petugas Ruang`);
      lines.push(``);
      lines.push(``);
      lines.push(``);
      lines.push(``);
      lines.push(``);
      lines.push(``);
      lines.push(`(         )      (         )`);
      lines.push(`--------------------------------`);
      lines.push(`    PENYERAHAN DEKONTAMINASI`);
      lines.push(`Petugas Ruang      Petugas Steril`);
      lines.push(``);
      lines.push(``);
      lines.push(``);
      lines.push(``);
      lines.push(``);
      lines.push(``);
      lines.push(`(         )      (         )`);
    }

    lines.push(`--------------------------------`);
    lines.push(`[[CENTER]]*Terima kasih.*[[/CENTER]]`);

    return lines.join('\n') + '\n\n';
  }

  /**
   * Prints formatted ESC/POS commands to the connected Bluetooth printer
   */
  public async printText(text: string): Promise<boolean> {
    if (!this.printCharacteristic || !this.server?.connected) {
      // If not connected, trigger scan connection
      const connected = await this.scanAndConnect();
      if (!connected) return false;
    }

    try {
      const ESC = 0x1B;
      const GS = 0x1D;
      let commands: number[] = [];

      // Reset / Init
      commands.push(ESC, 0x40);

      const addText = (str: string) => {
        const encoder = new TextEncoder();
        const encoded = encoder.encode(str);
        for (let i = 0; i < encoded.length; i++) {
          commands.push(encoded[i]);
        }
      };

      const lines = text.split('\n');
      for (let i = 0; i < lines.length; i++) {
        let line = lines[i];

        // 1. CENTER ALIGNMENT
        if (line.includes('[[CENTER]]') && line.includes('[[/CENTER]]')) {
          commands.push(ESC, 0x61, 1);
          line = line.replace('[[CENTER]]', '').replace('[[/CENTER]]', '');
          addText(line + '\n');
          commands.push(ESC, 0x61, 0);
          continue;
        }

        // 2. QR CODE (2D)
        if (line.includes('[[QR]]') && line.includes('[[/QR]]')) {
          const qrData = line.substring(line.indexOf('[[QR]]') + 6, line.indexOf('[[/QR]]'));
          commands.push(ESC, 0x61, 1);
          const qrLength = qrData.length + 3;
          const pL = qrLength % 256;
          const pH = Math.floor(qrLength / 256);
          
          commands.push(GS, 0x28, 0x6B, 0x04, 0x00, 0x31, 0x41, 0x32, 0x00);
          commands.push(GS, 0x28, 0x6B, 0x03, 0x00, 0x31, 0x43, 0x06);
          commands.push(GS, 0x28, 0x6B, 0x03, 0x00, 0x31, 0x45, 0x31);
          commands.push(GS, 0x28, 0x6B, pL, pH, 0x31, 0x50, 0x30);
          addText(qrData);
          commands.push(GS, 0x28, 0x6B, 0x03, 0x00, 0x31, 0x51, 0x30);
          commands.push(ESC, 0x61, 0);
          commands.push(0x0A);
          continue;
        }

        // 3. BARCODE (1D CODE128)
        if (line.includes('[[BARCODE]]') && line.includes('[[/BARCODE]]')) {
          const barcodeData = line.substring(line.indexOf('[[BARCODE]]') + 11, line.indexOf('[[/BARCODE]]'));
          commands.push(ESC, 0x61, 1);
          commands.push(GS, 0x68, 80); // Height 80 dots (longer vertically for easier scanning)
          // Set module width: 2 for thicker/clearer bars. Fallback to 1 if extremely long so it fits in 384 dots.
          const moduleWidth = barcodeData.length > 15 ? 1 : 2;
          commands.push(GS, 0x77, moduleWidth);
          commands.push(GS, 0x48, 2);  // HRI below
          
          const bLen = barcodeData.length + 2;
          commands.push(GS, 0x6B, 0x49, bLen, 0x7B, 0x42);
          addText(barcodeData);
          commands.push(ESC, 0x61, 0);
          commands.push(0x0A);
          continue;
        }

        addText(line + '\n');
      }

      // Feed line
      commands.push(0x0A, 0x0A, 0x0A);

      // Send BLE chunks with pacing delay to avoid buffer overflow on 57mm thermal BLE printers
      const chunkSize = 20;
      const delayMs = 20;
      const data = new Uint8Array(commands);
      const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
      
      for (let i = 0; i < data.length; i += chunkSize) {
        const chunk = data.slice(i, i + chunkSize);
        let sent = false;
        let attempts = 0;
        while (!sent && attempts < 8) {
          try {
            if (this.printCharacteristic.properties?.writeWithoutResponse && typeof this.printCharacteristic.writeValueWithoutResponse === 'function') {
              await this.printCharacteristic.writeValueWithoutResponse(chunk);
            } else if (typeof this.printCharacteristic.writeValueWithResponse === 'function') {
              await this.printCharacteristic.writeValueWithResponse(chunk);
            } else {
              await this.printCharacteristic.writeValue(chunk);
            }
            sent = true;
          } catch (writeErr: any) {
            attempts++;
            if (attempts >= 8) throw writeErr;
            await sleep(100 * attempts);
          }
        }
        await sleep(delayMs);
      }

      return true;
    } catch (err: any) {
      console.error("Gagal mencetak ke printer Bluetooth:", err);
      alert("Gagal mencetak: " + (err.message || "Koneksi terputus"));
      return false;
    }
  }
}

export const bluetoothPrinterService = new BluetoothPrinterService();
export default bluetoothPrinterService;
