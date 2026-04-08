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
    <Box minH="100vh" bg="gray.50" color="gray.800" py={{ base: 6, md: 10 }}>
      <Container maxW="7xl">
        <VStack spacing={6} align="stretch">
          <Flex justify="space-between" align={{ base: 'start', md: 'end' }} direction={{ base: 'column', md: 'row' }} gap={2}>
            <Box>
              <Heading size="xl" color="gray.900">DoNext AI</Heading>
              <Text mt={1} color="gray.600" fontSize="sm">Decision-first task execution for focused work.</Text>
            </Box>
            <Badge colorScheme="blue" variant="subtle" px={3} py={1} borderRadius="full">Live Prioritization</Badge>
          </Flex>

          <Grid templateColumns={{ base: '1fr', lg: '1.15fr 0.85fr' }} gap={5}>
            <Box bg="white" borderRadius="xl" p={5} borderWidth="1px" borderColor="gray.200" shadow="sm">
              <Text fontWeight="semibold" mb={4}>Add Task</Text>
              <Stack spacing={3}>
                <FormControl>
                  <FormLabel color="gray.700">Task</FormLabel>
                  <Input bg="white" value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Build polished landing UI" />
                </FormControl>

                <Grid templateColumns={{ base: '1fr', md: '1fr 1fr 1fr' }} gap={3}>
                  <FormControl>
                    <FormLabel color="gray.700">Deadline</FormLabel>
                    <Input bg="white" type="datetime-local" value={deadline} onChange={(event) => setDeadline(event.target.value)} />
                  </FormControl>

                  <FormControl>
                    <FormLabel color="gray.700">Priority</FormLabel>
                    <Select bg="white" value={priority} onChange={(event) => setPriority(event.target.value as Priority)}>
                      <option value="low">Low</option>
                      <option value="medium">Medium</option>
                      <option value="high">High</option>
                    </Select>
                  </FormControl>

                  <FormControl>
                    <FormLabel color="gray.700">Est. mins</FormLabel>
                    <Input bg="white" type="number" min={5} value={estimatedMinutes} onChange={(event) => setEstimatedMinutes(event.target.value)} placeholder="45" />
                  </FormControl>
                </Grid>

                <FormControl>
                  <FormLabel color="gray.700">Depends on task (optional)</FormLabel>
                  <Select bg="white" value={dependsOnTaskId} onChange={(event) => setDependsOnTaskId(event.target.value)}>
                    <option value="">No dependency</option>
                    {pendingTasks.map((task) => (
                      <option key={task.id} value={task.id}>{task.title}</option>
                    ))}
                  </Select>
                </FormControl>

                <Button colorScheme="blue" onClick={addTask}>Add Task</Button>
              </Stack>
            </Box>

            <Box bg="white" borderRadius="xl" p={5} borderWidth="1px" borderColor="gray.200" shadow="sm">
              <Text fontWeight="semibold" mb={4}>Your Context</Text>
              <Stack spacing={3}>
                <FormControl>
                  <FormLabel color="gray.700">Available time (minutes)</FormLabel>
                  <Input bg="white" type="number" min={5} value={availableMinutes} onChange={(event) => setAvailableMinutes(event.target.value)} />
                </FormControl>
                <FormControl>
                  <FormLabel color="gray.700">Energy level</FormLabel>
                  <Select bg="white" value={energyLevel} onChange={(event) => setEnergyLevel(event.target.value as EnergyLevel)}>
                    <option value="low">Low</option>
                    <option value="medium">Medium</option>
                    <option value="high">High</option>
                  </Select>
                </FormControl>
                <Text color="gray.500" fontSize="sm">Context is included on every recommendation request.</Text>
              </Stack>
            </Box>
          </Grid>

          <Center>
            <Button
              size="lg"
              px={10}
              colorScheme="blue"
              onClick={requestDoNext}
              isLoading={loading}
              loadingText="Analyzing..."
            >
              Do Next Task
            </Button>
          </Center>

          <Grid templateColumns={{ base: '1fr', lg: '1fr 1fr' }} gap={5}>
            <Box bg="white" borderRadius="xl" p={5} borderWidth="1px" borderColor="gray.200" shadow="sm">
              <Text fontWeight="semibold" mb={4}>Task List</Text>
              <Stack spacing={3}>
                {tasks.length === 0 && <Text color="gray.500">No tasks yet. Add one to begin.</Text>}

                {tasks.map((task) => {
                  const urgent = !task.done && isUrgent(task.deadline)
                  return (
                    <Flex
                      key={task.id}
                      justify="space-between"
                      align="center"
                      p={3}
                      borderRadius="lg"
                      bg={task.done ? 'gray.50' : 'white'}
                      borderWidth="1px"
                      borderColor={urgent ? 'orange.300' : 'gray.200'}
                    >
                      <Box>
                        <HStack spacing={2} mb={1}>
                          <Text fontWeight="medium" color="gray.800" textDecoration={task.done ? 'line-through' : 'none'}>{task.title}</Text>
                          {urgent && <Badge colorScheme="orange">Urgent</Badge>}
                          <Badge colorScheme={task.priority === 'high' ? 'red' : task.priority === 'medium' ? 'yellow' : 'green'}>
                            {task.priority}
                          </Badge>
                        </HStack>
                        <Text fontSize="xs" color="gray.500">
                          {task.deadline ? `Due: ${new Date(task.deadline).toLocaleString()}` : 'No deadline'}
                          {task.estimatedMinutes ? ` • ${task.estimatedMinutes} mins` : ''}
                        </Text>
                      </Box>
                      <HStack>
                        <Button size="sm" variant="outline" colorScheme={task.done ? 'gray' : 'blue'} onClick={() => toggleDone(task.id)}>
                          {task.done ? 'Undo' : 'Done'}
                        </Button>
                        <Button size="sm" colorScheme="red" variant="ghost" onClick={() => deleteTask(task.id)}>
                          Delete
                        </Button>
                      </HStack>
                    </Flex>
                  )
                })}
              </Stack>
            </Box>

            <Box bg="white" borderRadius="xl" p={5} borderWidth="1px" borderColor="gray.200" shadow="sm">
              <Text fontWeight="semibold" mb={4}>AI Output</Text>
              {!aiResult && <Text color="gray.500">Click “Do Next Task” to get your optimized next move.</Text>}

              {aiResult && (
                <Stack spacing={3}>
                  <Heading size="md" color="gray.900">{aiResult.next_task_title}</Heading>
                  <Text color="gray.600">{aiResult.why}</Text>
                  <Badge alignSelf="flex-start" colorScheme="blue" variant="subtle">Estimated: {aiResult.estimated_minutes} mins</Badge>

                  <Box>
                    <Text mb={2} fontWeight="semibold" color="gray.800">Micro-actions (hotkeys 1-9)</Text>
                    <VStack align="stretch" spacing={2}>
                      {aiResult.steps.map((step, index) => (
                        <HStack key={step} justify="space-between" bg="gray.50" p={2.5} borderRadius="md" borderWidth="1px" borderColor="gray.200">
                          <Text color="gray.700" textDecoration={doneSteps[index] ? 'line-through' : 'none'}>
                            {index + 1}. {step}
                          </Text>
                          <Button
                            size="xs"
                            colorScheme={doneSteps[index] ? 'green' : 'blue'}
                            variant={doneSteps[index] ? 'solid' : 'outline'}
                            onClick={() => setDoneSteps((current) => ({ ...current, [index]: !current[index] }))}
                          >
                            {doneSteps[index] ? 'Done' : 'Mark Done'}
                          </Button>
                        </HStack>
                      ))}
                    </VStack>
                  </Box>

                  <Text color="gray.700" fontWeight="medium">{aiResult.motivation}</Text>
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
