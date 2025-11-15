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

        <div v-if="enableGpodderAPI" class="flex items-center py-4">
          <div class="w-80">
            <ui-dropdown v-model="gpodderLibraryId" :items="podcastLibraries" :label="$strings.LabelGpodderLibrary" :disabled="updatingServerSettings" @input="updateGpodderLibrary">
              <template #item="{ item }">
                <div class="flex items-center">
                  <span class="material-symbols text-xl mr-2">podcasts</span>
                  <span>{{ item.text }}</span>
                </div>
              </template>
            </ui-dropdown>
          </div>
          <ui-tooltip v-if="!podcastLibraries.length" :text="$strings.MessageNoLibraries || 'No podcast libraries found. Create a podcast library first.'">
            <span class="material-symbols icon-text ml-2 text-warning">warning</span>
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
      gpodderLibraryId: null,
      numDevices: 0
    }
  },
  watch: {
    serverSettings: {
      immediate: true,
      handler(newVal) {
        if (newVal) {
          this.enableGpodderAPI = !!newVal.enableGpodderAPI
          this.gpodderLibraryId = newVal.gpodderLibraryId || null
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
    },
    libraries() {
      return this.$store.state.libraries.libraries || []
    },
    podcastLibraries() {
      return this.libraries
        .filter((lib) => lib.mediaType === 'podcast')
        .map((lib) => ({
          text: lib.name,
          value: lib.id
        }))
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
    },
    updateGpodderLibrary(libraryId) {
      this.updatingServerSettings = true
      this.$store
        .dispatch('updateServerSettings', { gpodderLibraryId: libraryId })
        .then((response) => {
          this.updatingServerSettings = false

          if (response.error) {
            console.error('Failed to update server settings', response.error)
            this.$toast.error(response.error)
            return
          }

          const libraryName = this.podcastLibraries.find((lib) => lib.value === libraryId)?.text || 'library'
          this.$toast.success(`Gpodder library set to ${libraryName}`)
        })
        .catch((error) => {
          console.error('Failed to update server settings', error)
          this.$toast.error('Failed to update settings')
          this.updatingServerSettings = false
        })
    }
  },
  mounted() {
    // Load libraries if not already loaded
    if (!this.$store.state.libraries.libraries?.length) {
      this.$store.dispatch('libraries/load')
    }
  }
}
</script>
