<template>
  <div>
    <div class="text-center">
      <table id="gpodder-devices">
        <tr>
          <th>{{ $strings.LabelDevice }}</th>
          <th class="hidden sm:table-cell">{{ $strings.LabelType }}</th>
          <th class="w-32 hidden sm:table-cell">{{ $strings.LabelLastSeen }}</th>
        </tr>
        <tr v-for="device in devices" :key="device.id">
          <td>
            <p class="truncate">{{ device.deviceId }}</p>
          </td>
          <td class="text-sm hidden sm:table-cell">{{ device.type }}</td>
          <td class="text-xs font-mono hidden sm:table-cell">
            <ui-tooltip v-if="device.updatedAt" direction="top" :text="$formatDatetime(device.updatedAt, dateFormat, timeFormat)">
              {{ $dateDistanceFromNow(device.updatedAt) }}
            </ui-tooltip>
          </td>
        </tr>
      </table>
    </div>
  </div>
</template>

<script>
export default {
  data() {
    return {
      devices: []
    }
  },
  computed: {
    dateFormat() {
      return this.$store.getters['getServerSetting']('dateFormat')
    },
    timeFormat() {
      return this.$store.getters['getServerSetting']('timeFormat')
    }
  },
  methods: {
    loadDevices() {
      this.$axios
        .$get('/api/gpodder-devices')
        .then((res) => {
          this.devices = res.devices
            .map((device) => ({
              ...device,
              createdAt: new Date(device.createdAt).valueOf(),
              updatedAt: new Date(device.updatedAt).valueOf()
            }))
            .sort((a, b) => {
              return b.updatedAt - a.updatedAt
            })
          this.$emit('numDevices', this.devices.length)
        })
        .catch((error) => {
          console.error('Failed to load Gpodder devices', error)
        })
    },
    addUpdateDevice(device) {
      if (!this.devices) return
      const index = this.devices.findIndex((d) => d.id === device.id)
      if (index >= 0) {
        this.devices.splice(index, 1, device)
      } else {
        this.devices.push(device)
      }
    },
    deviceRemoved(device) {
      this.devices = this.devices.filter((d) => d.id !== device.id)
    },
    init(attempts = 0) {
      if (!this.$root.socket) {
        if (attempts > 10) {
          return console.error('Failed to setup socket listeners')
        }
        setTimeout(() => {
          this.init(++attempts)
        }, 250)
        return
      }
      this.$root.socket.on('gpodder_device_added', this.addUpdateDevice)
      this.$root.socket.on('gpodder_device_updated', this.addUpdateDevice)
      this.$root.socket.on('gpodder_device_removed', this.deviceRemoved)
    }
  },
  mounted() {
    this.loadDevices()
    this.init()
  },
  beforeDestroy() {
    if (this.$root.socket) {
      this.$root.socket.off('gpodder_device_added', this.addUpdateDevice)
      this.$root.socket.off('gpodder_device_updated', this.addUpdateDevice)
      this.$root.socket.off('gpodder_device_removed', this.deviceRemoved)
    }
  }
}
</script>

<style>
#gpodder-devices {
  table-layout: fixed;
  border-collapse: collapse;
  border: 1px solid #474747;
  width: 100%;
}

#gpodder-devices td,
#gpodder-devices th {
  padding: 8px 8px;
  text-align: left;
}

#gpodder-devices tr:nth-child(even) {
  background-color: #373838;
}

#gpodder-devices tr:nth-child(odd) {
  background-color: #2f2f2f;
}

#gpodder-devices tr:hover {
  background-color: #444;
}

#gpodder-devices th {
  font-size: 0.8rem;
  font-weight: 600;
  padding-top: 5px;
  padding-bottom: 5px;
  background-color: #272727;
}
</style>
