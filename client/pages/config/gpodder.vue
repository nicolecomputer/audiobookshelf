<template>
  <div>
    <app-settings-content :header-text="$strings.HeaderGpodder" :description="$strings.GpodderDescription"> </app-settings-content>
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
    return {}
  },
  computed: {
    userIsAdminOrUp() {
      return this.$store.getters['user/getIsAdminOrUp']
    }
  },
  methods: {},
  mounted() {}
}
</script>
