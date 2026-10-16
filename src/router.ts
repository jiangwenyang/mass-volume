import { createRouter, createWebHistory } from 'vue-router'
import StudentView from './views/StudentView.vue'
import TeacherView from './views/TeacherView.vue'

/** 教师投影在首页，平板填写在 /s */
export const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', component: TeacherView },
    { path: '/s', component: StudentView },
  ],
})
