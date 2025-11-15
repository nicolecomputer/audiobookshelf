<template>
  <div>
    <app-settings-content :header-text="$strings.HeaderGpodder" :description="$strings.GpodderDescription">
      <template #header-items>
        <div v-if="numDevices" class="mx-2 px-1.5 rounded-lg bg-primary/50 text-gray-300/90 text-sm inline-flex items-center justify-center">
          <span>{{ numDevices }}</span>
        </div>
      </template>

      <div class="pt-4">
        <div role="article" :aria-label="$strings.LabelSettingsEnableGpodderAPIHelp" class="flex items-center py-2">
          <ui-toggle-switch :label="$strings.LabelSettingsEnableGpodderAPI" v-model="enableGpodderAPI" :disabled="updatingServerSettings" @input="updateGpodderEnabled" />
          <ui-tooltip aria-hidden="true" :text="$strings.LabelSettingsEnableGpodderAPIHelp">
            <p class="pl-4">
              <span id="settings-enable-gpodder-api">{{ $strings.LabelSettingsEnableGpodderAPI }}</span>
              <span class="material-symbols icon-text">info</span>
            </p>
          </ui-tooltip>
        </div>
      </div>

      <tables-gpodder-devices-table class="pt-8" @numDevices="(count) => (numDevices = count)" />
    </app-settings-content>
  </div>
</template>

<script>
export default {
  asyncData({ store, redirect }) {
    if (!store.getters['user/getIsAdminOrUp']) {
      redirect('/')
    }
  },
  data() {
    return {
      updatingServerSettings: false,
      enableGpodderAPI: false,
      numDevices: 0
    }
  },
  watch: {
    serverSettings: {
      immediate: true,
      handler(newVal) {
        if (newVal) {
          this.enableGpodderAPI = !!newVal.enableGpodderAPI
        }
      }
    }
  },
  computed: {
    userIsAdminOrUp() {
      return this.$store.getters['user/getIsAdminOrUp']
    },
    serverSettings() {
      return this.$store.state.serverSettings
    }
  },
  methods: {
    updateGpodderEnabled(val) {
      this.updatingServerSettings = true
      this.$store
        .dispatch('updateServerSettings', { enableGpodderAPI: val })
        .then((response) => {
          this.updatingServerSettings = false

          if (response.error) {
            console.error('Failed to update server settings', response.error)
            this.$toast.error(response.error)
            this.enableGpodderAPI = !val
            return
          }

          this.$toast.success(val ? 'Gpodder API enabled' : 'Gpodder API disabled')
        })
        .catch((error) => {
          console.error('Failed to update server settings', error)
          this.$toast.error('Failed to update settings')
          this.updatingServerSettings = false
          this.enableGpodderAPI = !val
        })
    }
  },
  mounted() {}
}
</script>
