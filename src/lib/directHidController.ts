import type { HidDeviceIdentity } from '../types/game'
import type { HidReports } from './hidInput'

interface HidDeviceState {
  device: HIDDevice
  reports: Map<number, Uint8Array>
  timestamp: number
}

const deviceStates = new Map<string, HidDeviceState>()
const attachedDevices = new WeakSet<HIDDevice>()

export function hidDeviceKey(device: HidDeviceIdentity): string {
  return `${device.vendorId}:${device.productId}:${device.productName}`
}

function identityFor(device: HIDDevice): HidDeviceIdentity {
  return {
    vendorId: device.vendorId,
    productId: device.productId,
    productName: device.productName || 'Direct HID controller',
  }
}

async function attachDevice(device: HIDDevice): Promise<HidDeviceIdentity> {
  if (!device.opened) await device.open()

  const identity = identityFor(device)
  const key = hidDeviceKey(identity)
  let state = deviceStates.get(key)
  if (!state) {
    state = { device, reports: new Map(), timestamp: 0 }
    deviceStates.set(key, state)
  } else {
    state.device = device
  }

  if (!attachedDevices.has(device)) {
    attachedDevices.add(device)
    device.addEventListener('inputreport', (event) => {
      const current = deviceStates.get(key)
      if (!current) return
      current.reports.set(
        event.reportId,
        Uint8Array.from(
          new Uint8Array(
            event.data.buffer,
            event.data.byteOffset,
            event.data.byteLength,
          ),
        ),
      )
      current.timestamp = performance.now()
    })
  }

  return identity
}

export async function requestDirectHidDevice(): Promise<HidDeviceIdentity> {
  if (!navigator.hid) {
    throw new Error(
      'Direct controller access requires current Chrome or Edge.',
    )
  }

  const [device] = await navigator.hid.requestDevice({ filters: [] })
  if (!device) throw new Error('No direct controller was selected.')
  return attachDevice(device)
}

export async function reconnectDirectHidDevice(
  identity: HidDeviceIdentity,
): Promise<boolean> {
  if (!navigator.hid) return false
  const devices = await navigator.hid.getDevices()
  const device = devices.find(
    (candidate) =>
      candidate.vendorId === identity.vendorId &&
      candidate.productId === identity.productId &&
      (candidate.productName || 'Direct HID controller') ===
        identity.productName,
  )
  if (!device) return false
  await attachDevice(device)
  return true
}

export function directHidSnapshot(identity: HidDeviceIdentity): {
  reports: HidReports
  timestamp: number
} {
  const state = deviceStates.get(hidDeviceKey(identity))
  return {
    reports: state?.reports ?? new Map(),
    timestamp: state?.timestamp ?? 0,
  }
}
