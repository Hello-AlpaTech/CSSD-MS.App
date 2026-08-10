let isPrintingLock = false;

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

async function sendChunkWithRetry(characteristic: any, chunk: Uint8Array) {
  let attempts = 0;
  while (attempts < 8) {
    try {
      if (characteristic.properties?.writeWithoutResponse && typeof characteristic.writeValueWithoutResponse === 'function') {
        await characteristic.writeValueWithoutResponse(chunk);
      } else if (typeof characteristic.writeValueWithResponse === 'function') {
        await characteristic.writeValueWithResponse(chunk);
      } else {
        await characteristic.writeValue(chunk);
      }
      return;
    } catch (writeErr: any) {
      attempts++;
      if (attempts >= 8) throw writeErr;
      await sleep(100 * attempts);
    }
  }
}

export async function printViaBluetooth(text: string, options?: { skipDefaultHeader?: boolean }) {
  if (!navigator.bluetooth) {
    alert("Browser Anda belum mendukung Web Bluetooth API. Gunakan Chrome atau browser berbasis Chromium.");
    return false;
  }

  // Prevent concurrent GATT operations
  if (isPrintingLock) {
    await sleep(300);
    if (isPrintingLock) {
      alert("Proses pencetakan lain sedang berjalan. Silakan tunggu sebentar.");
      return false;
    }
  }

  isPrintingLock = true;
  let server: any = null;

  try {
    let device;
    try {
      device = await navigator.bluetooth.requestDevice({
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
        console.log("Pengguna membatalkan pemilihan perangkat Bluetooth.");
        return false;
      }
      // Fallback with specific filters if acceptAllDevices fails on some platforms
      device = await navigator.bluetooth.requestDevice({
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

    if (!device) return false;

    server = await device.gatt?.connect();
    if (!server) throw new Error("Gagal terhubung ke GATT server printer.");

    const services = await server.getPrimaryServices();
    let printCharacteristic;
    
    for (const service of services) {
      const characteristics = await service.getCharacteristics();
      for (const char of characteristics) {
        if (char.properties.write || char.properties.writeWithoutResponse) {
          printCharacteristic = char;
          break;
        }
      }
      if (printCharacteristic) break;
    }

    if (!printCharacteristic) throw new Error("Karakteristik pencetakan tidak ditemukan pada printer ini.");

    // --- ESC/POS COMMAND BUILDER ---
    const ESC = 0x1B;
    const GS = 0x1D;
    let commands: number[] = [];

    // Initialize printer
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

      // 1. FORMAT: CENTER TEXT
      if (line.includes('[[CENTER]]') && line.includes('[[/CENTER]]')) {
        commands.push(ESC, 0x61, 1); // Align center
        line = line.replace('[[CENTER]]', '').replace('[[/CENTER]]', '');
        addText(line + '\n');
        commands.push(ESC, 0x61, 0); // Align left
        continue;
      }

      // 2. FORMAT: QR CODE (2D)
      if (line.includes('[[QR]]') && line.includes('[[/QR]]')) {
        const qrData = line.substring(line.indexOf('[[QR]]') + 6, line.indexOf('[[/QR]]'));
        commands.push(ESC, 0x61, 1); // Center
        
        const qrLength = qrData.length + 3;
        const pL = qrLength % 256;
        const pH = Math.floor(qrLength / 256);
        
        commands.push(GS, 0x28, 0x6B, 0x04, 0x00, 0x31, 0x41, 0x32, 0x00); // Model
        commands.push(GS, 0x28, 0x6B, 0x03, 0x00, 0x31, 0x43, 0x06);       // Size
        commands.push(GS, 0x28, 0x6B, 0x03, 0x00, 0x31, 0x45, 0x31);       // Error correction
        commands.push(GS, 0x28, 0x6B, pL, pH, 0x31, 0x50, 0x30);           // Store data
        addText(qrData);
        commands.push(GS, 0x28, 0x6B, 0x03, 0x00, 0x31, 0x51, 0x30);       // Print
        
        commands.push(ESC, 0x61, 0); // Reset align
        commands.push(0x0A); // New line
        continue;
      }

      // 3. FORMAT: BARCODE BATANG (1D - CODE128)
      if (line.includes('[[BARCODE]]') && line.includes('[[/BARCODE]]')) {
        const barcodeData = line.substring(line.indexOf('[[BARCODE]]') + 11, line.indexOf('[[/BARCODE]]'));
        commands.push(ESC, 0x61, 1); // Center Barcode
        
        commands.push(GS, 0x68, 80); // Set barcode height (80 dots - longer/clearer for scanning)
        // Set module width: 2 for thicker/clearer bars. Fallback to 1 if extremely long so it fits in 384 dots.
        const moduleWidth = barcodeData.length > 15 ? 1 : 2;
        commands.push(GS, 0x77, moduleWidth);
        commands.push(GS, 0x48, 2);  // HRI position (text below barcode)
        
        // Print barcode CODE128 (System 73 / 0x49)
        const bLen = barcodeData.length + 2; // +2 for CodeB subset chars ({B)
        commands.push(GS, 0x6B, 0x49, bLen, 0x7B, 0x42);
        addText(barcodeData);
        
        commands.push(ESC, 0x61, 0); // Reset align
        commands.push(0x0A); // New line
        continue;
      }

      // Default Text
      addText(line + '\n');
    }

    // Feed paper
    commands.push(0x0A, 0x0A, 0x0A);

    // Chunking the data to send over Bluetooth.
    // NOTE: printer thermal BLE murah (mis. VSC 57mm) punya buffer internal kecil.
    // Chunk besar (512 byte) tanpa jeda membuat sebagian paket di-drop/ditimpa
    // printer sebelum sempat dicetak -> baris hilang & teks tumpang tindih.
    // Kirim per 20 byte (MTU default BLE) dengan jeda kecil antar-paket.
    const chunkSize = 20;
    const delayMs = 20;
    const data = new Uint8Array(commands);

    for (let i = 0; i < data.length; i += chunkSize) {
      const chunk = data.slice(i, i + chunkSize);
      await sendChunkWithRetry(printCharacteristic, chunk);
      await sleep(delayMs);
    }

    return true;
  } catch (error: any) {
    if (error?.name === 'NotFoundError' || error?.message?.includes('cancelled') || error?.message?.includes('chooser')) {
      console.log("Pengguna membatalkan dialog pemilihan Bluetooth.");
      return false;
    }
    console.error("Bluetooth print error:", error);
    alert("Gagal mencetak: Pastikan Bluetooth aktif dan printer terhubung.");
    return false;
  } finally {
    isPrintingLock = false;
    if (server && server.connected) {
      try {
        server.disconnect();
      } catch (e) {
        // ignore disconnect error
      }
    }
  }
}