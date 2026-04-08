import { useEffect, useMemo, useState } from 'react'
import {
  Badge,
  Box,
  Button,
  Center,
  Container,
  Flex,
  FormControl,
  FormLabel,
  Grid,
  Heading,
  HStack,
  Input,
  Select,
  Stack,
  Text,
  useToast,
  VStack,
} from '@chakra-ui/react'
import { FiCheckCircle, FiClock, FiTrash2, FiZap } from 'react-icons/fi'

type Priority = 'low' | 'medium' | 'high'
type EnergyLevel = 'low' | 'medium' | 'high'

type Task = {
  id: string
  title: string
  deadline?: string
  priority: Priority
  estimatedMinutes?: number
  dependsOnTaskId?: string
  done: boolean
}

type UserContext = {
  availableMinutes?: number
  energyLevel: EnergyLevel
}

type AiResult = {
  next_task_id: string
  next_task_title: string
  why: string
  steps: string[]
  estimated_minutes: number
  motivation: string
}

const TASKS_KEY = 'donext.tasks.v1'
const CONTEXT_KEY = 'donext.context.v1'
const API_BASE = import.meta.env.VITE_API_BASE_URL ?? ''

function isUrgent(deadline?: string) {
  if (!deadline) {
    return false
  }
  const due = new Date(deadline)
  const now = new Date()
  return due.getTime() - now.getTime() <= 24 * 60 * 60 * 1000
}

function App() {
  const toast = useToast()

  const [tasks, setTasks] = useState<Task[]>([])
  const [title, setTitle] = useState('')
  const [deadline, setDeadline] = useState('')
  const [priority, setPriority] = useState<Priority>('medium')
  const [estimatedMinutes, setEstimatedMinutes] = useState('')
  const [dependsOnTaskId, setDependsOnTaskId] = useState('')

  const [availableMinutes, setAvailableMinutes] = useState('30')
  const [energyLevel, setEnergyLevel] = useState<EnergyLevel>('medium')

  const [loading, setLoading] = useState(false)
  const [aiResult, setAiResult] = useState<AiResult | null>(null)
  const [doneSteps, setDoneSteps] = useState<Record<number, boolean>>({})

  useEffect(() => {
    const storedTasks = localStorage.getItem(TASKS_KEY)
    const storedContext = localStorage.getItem(CONTEXT_KEY)

    if (storedTasks) {
      setTasks(JSON.parse(storedTasks) as Task[])
    }

    if (storedContext) {
      const context = JSON.parse(storedContext) as UserContext
      setAvailableMinutes(context.availableMinutes?.toString() ?? '')
      setEnergyLevel(context.energyLevel ?? 'medium')
    }
  }, [])

  useEffect(() => {
    localStorage.setItem(TASKS_KEY, JSON.stringify(tasks))
  }, [tasks])

  useEffect(() => {
    const context: UserContext = {
      availableMinutes: availableMinutes ? Number(availableMinutes) : undefined,
      energyLevel,
    }
    localStorage.setItem(CONTEXT_KEY, JSON.stringify(context))
  }, [availableMinutes, energyLevel])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!aiResult) {
        return
      }

      const key = Number(event.key)
      if (Number.isNaN(key) || key < 1 || key > aiResult.steps.length) {
        return
      }

      setDoneSteps((current) => ({ ...current, [key - 1]: !current[key - 1] }))
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [aiResult])

  const pendingTasks = useMemo(() => tasks.filter((task) => !task.done), [tasks])

  const addTask = () => {
    if (!title.trim()) {
      toast({ title: 'Task title is required', status: 'warning', duration: 1500 })
      return
    }

    const nextTask: Task = {
      id: crypto.randomUUID(),
      title: title.trim(),
      priority,
      done: false,
      deadline: deadline || undefined,
      estimatedMinutes: estimatedMinutes ? Number(estimatedMinutes) : undefined,
      dependsOnTaskId: dependsOnTaskId || undefined,
    }

    setTasks((current) => [nextTask, ...current])
    setTitle('')
    setDeadline('')
    setPriority('medium')
    setEstimatedMinutes('')
    setDependsOnTaskId('')
  }

  const toggleDone = (id: string) => {
    setTasks((current) =>
      current.map((task) =>
        task.id === id ? { ...task, done: !task.done } : task,
      ),
    )
  }

  const deleteTask = (id: string) => {
    setTasks((current) => current.filter((task) => task.id !== id))
  }

  const requestDoNext = async () => {
    if (!pendingTasks.length) {
      toast({ title: 'Add at least one pending task', status: 'info', duration: 1800 })
      return
    }

    setLoading(true)
    try {
      const response = await fetch(`${API_BASE}/api/donext`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tasks,
          user_context: {
            available_minutes: availableMinutes ? Number(availableMinutes) : undefined,
            energy_level: energyLevel,
          },
        }),
      })

      if (!response.ok) {
        throw new Error('AI prioritization failed')
      }

      const result = (await response.json()) as AiResult
      setAiResult(result)
      setDoneSteps({})
    } catch {
      toast({
        title: 'Could not fetch AI plan',
        description: 'Check backend is running and API key is configured.',
        status: 'error',
        duration: 2200,
      })
    } finally {
      setLoading(false)
    }
  }

  return (
    <Box minH="100vh" bg="gray.900" color="gray.100" py={8}>
      <Container maxW="6xl">
        <VStack spacing={6} align="stretch">
          <Center>
            <Heading size="2xl" bgGradient="linear(to-r, purple.400, pink.400)" bgClip="text">
              DoNext AI
            </Heading>
          </Center>

          <Grid templateColumns={{ base: '1fr', lg: '1.1fr 0.9fr' }} gap={6}>
            <Box bg="gray.800" borderRadius="2xl" p={5} borderWidth="1px" borderColor="gray.700">
              <Text fontWeight="bold" mb={4}>Add Task</Text>
              <Stack spacing={3}>
                <FormControl>
                  <FormLabel>Task</FormLabel>
                  <Input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Build polished landing UI" />
                </FormControl>

                <Grid templateColumns={{ base: '1fr', md: '1fr 1fr 1fr' }} gap={3}>
                  <FormControl>
                    <FormLabel>Deadline</FormLabel>
                    <Input type="datetime-local" value={deadline} onChange={(event) => setDeadline(event.target.value)} />
                  </FormControl>

                  <FormControl>
                    <FormLabel>Priority</FormLabel>
                    <Select value={priority} onChange={(event) => setPriority(event.target.value as Priority)}>
                      <option value="low">Low</option>
                      <option value="medium">Medium</option>
                      <option value="high">High</option>
                    </Select>
                  </FormControl>

                  <FormControl>
                    <FormLabel>Est. mins</FormLabel>
                    <Input type="number" min={5} value={estimatedMinutes} onChange={(event) => setEstimatedMinutes(event.target.value)} placeholder="45" />
                  </FormControl>
                </Grid>

                <FormControl>
                  <FormLabel>Depends on task (optional)</FormLabel>
                  <Select value={dependsOnTaskId} onChange={(event) => setDependsOnTaskId(event.target.value)}>
                    <option value="">No dependency</option>
                    {pendingTasks.map((task) => (
                      <option key={task.id} value={task.id}>{task.title}</option>
                    ))}
                  </Select>
                </FormControl>

                <Button colorScheme="purple" onClick={addTask}>Add Task</Button>
              </Stack>
            </Box>

            <Box bg="gray.800" borderRadius="2xl" p={5} borderWidth="1px" borderColor="gray.700">
              <Text fontWeight="bold" mb={4}>Your Context</Text>
              <Stack spacing={3}>
                <FormControl>
                  <FormLabel>Available time (minutes)</FormLabel>
                  <Input type="number" min={5} value={availableMinutes} onChange={(event) => setAvailableMinutes(event.target.value)} />
                </FormControl>
                <FormControl>
                  <FormLabel>Energy level</FormLabel>
                  <Select value={energyLevel} onChange={(event) => setEnergyLevel(event.target.value as EnergyLevel)}>
                    <option value="low">Low</option>
                    <option value="medium">Medium</option>
                    <option value="high">High</option>
                  </Select>
                </FormControl>
                <Text color="gray.400" fontSize="sm">Context is sent on every Do Next call so recommendations adapt dynamically.</Text>
              </Stack>
            </Box>
          </Grid>

          <Center>
            <Button
              leftIcon={<FiZap />}
              size="lg"
              px={10}
              colorScheme="pink"
              onClick={requestDoNext}
              isLoading={loading}
              loadingText="Thinking..."
            >
              Do Next Task
            </Button>
          </Center>

          <Grid templateColumns={{ base: '1fr', lg: '1fr 1fr' }} gap={6}>
            <Box bg="gray.800" borderRadius="2xl" p={5} borderWidth="1px" borderColor="gray.700">
              <Text fontWeight="bold" mb={4}>Task List</Text>
              <Stack spacing={3}>
                {tasks.length === 0 && <Text color="gray.400">No tasks yet. Add one to begin.</Text>}

                {tasks.map((task) => {
                  const urgent = !task.done && isUrgent(task.deadline)
                  return (
                    <Flex
                      key={task.id}
                      justify="space-between"
                      align="center"
                      p={3}
                      borderRadius="lg"
                      bg={urgent ? 'red.900' : 'gray.700'}
                      borderWidth="1px"
                      borderColor={urgent ? 'red.500' : 'gray.600'}
                    >
                      <Box>
                        <HStack spacing={2}>
                          <Text textDecoration={task.done ? 'line-through' : 'none'}>{task.title}</Text>
                          {urgent && (
                            <Badge colorScheme="red" display="flex" alignItems="center" gap={1}>
                              <FiClock /> Urgent
                            </Badge>
                          )}
                          <Badge colorScheme={task.priority === 'high' ? 'red' : task.priority === 'medium' ? 'yellow' : 'green'}>
                            {task.priority}
                          </Badge>
                        </HStack>
                        <Text fontSize="xs" color="gray.300">
                          {task.deadline ? `Due: ${new Date(task.deadline).toLocaleString()}` : 'No deadline'}
                          {task.estimatedMinutes ? ` • ${task.estimatedMinutes} mins` : ''}
                        </Text>
                      </Box>
                      <HStack>
                        <Button size="sm" leftIcon={<FiCheckCircle />} onClick={() => toggleDone(task.id)}>
                          {task.done ? 'Undo' : 'Done'}
                        </Button>
                        <Button size="sm" colorScheme="red" variant="ghost" onClick={() => deleteTask(task.id)}>
                          <FiTrash2 />
                        </Button>
                      </HStack>
                    </Flex>
                  )
                })}
              </Stack>
            </Box>

            <Box bg="gray.800" borderRadius="2xl" p={5} borderWidth="1px" borderColor="gray.700">
              <Text fontWeight="bold" mb={4}>AI Output</Text>
              {!aiResult && <Text color="gray.400">Click “Do Next Task” to get your optimized next move.</Text>}

              {aiResult && (
                <Stack spacing={3}>
                  <Heading size="md">{aiResult.next_task_title}</Heading>
                  <Text color="gray.300">{aiResult.why}</Text>
                  <Badge alignSelf="flex-start" colorScheme="purple">Estimated: {aiResult.estimated_minutes} mins</Badge>

                  <Box>
                    <Text mb={2} fontWeight="semibold">Micro-actions (hotkeys 1-9)</Text>
                    <VStack align="stretch" spacing={2}>
                      {aiResult.steps.map((step, index) => (
                        <HStack key={step} justify="space-between" bg="gray.700" p={2} borderRadius="md">
                          <Text textDecoration={doneSteps[index] ? 'line-through' : 'none'}>
                            {index + 1}. {step}
                          </Text>
                          <Button
                            size="xs"
                            colorScheme={doneSteps[index] ? 'green' : 'purple'}
                            onClick={() => setDoneSteps((current) => ({ ...current, [index]: !current[index] }))}
                          >
                            {doneSteps[index] ? 'Done' : 'Mark Done'}
                          </Button>
                        </HStack>
                      ))}
                    </VStack>
                  </Box>

                  <Text color="pink.200" fontWeight="medium">{aiResult.motivation}</Text>
                </Stack>
              )}
            </Box>
          </Grid>
        </VStack>
      </Container>
    </Box>
  )
}

export default App
