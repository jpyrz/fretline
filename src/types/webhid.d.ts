interface HIDDeviceFilter {
  vendorId?: number
  productId?: number
  usagePage?: number
  usage?: number
}

interface HIDDeviceRequestOptions {
  filters: HIDDeviceFilter[]
}

interface HIDInputReportEvent extends Event {
  readonly device: HIDDevice
  readonly reportId: number
  readonly data: DataView
}

interface HIDConnectionEvent extends Event {
  readonly device: HIDDevice
}

interface HIDDevice extends EventTarget {
  readonly opened: boolean
  readonly vendorId: number
  readonly productId: number
  readonly productName: string
  open(): Promise<void>
  close(): Promise<void>
  forget?(): Promise<void>
  addEventListener(
    type: 'inputreport',
    listener: (event: HIDInputReportEvent) => void,
  ): void
}

interface HID extends EventTarget {
  getDevices(): Promise<HIDDevice[]>
  requestDevice(options: HIDDeviceRequestOptions): Promise<HIDDevice[]>
  addEventListener(
    type: 'connect' | 'disconnect',
    listener: (event: HIDConnectionEvent) => void,
  ): void
}

interface Navigator {
  readonly hid?: HID
}
