import 'package:flutter/material.dart';

void main() => runApp(const MyApp());

class MyApp extends StatelessWidget {
  const MyApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'NERA - AI Stylist',
      theme: ThemeData(
        primarySwatch: Colors.deepPurple,
        appBarTheme: const AppBarTheme(
          backgroundColor: Colors.deepPurple,
          foregroundColor: Colors.white,
        ),
        elevatedButtonTheme: ElevatedButtonThemeData(
          style: ElevatedButton.styleFrom(
            backgroundColor: Colors.deepPurple,
            foregroundColor: Colors.white,
            padding: const EdgeInsets.symmetric(vertical: 14),
          ),
        ),
      ),
      home: const MainScreen(),
    );
  }
}

class MainScreen extends StatefulWidget {
  const MainScreen({super.key});

  @override
  State<MainScreen> createState() => _MainScreenState();
}

class _MainScreenState extends State<MainScreen> {
  int _selectedIndex = 0;
  final List<Widget> _screens = [
    const WardrobeScreen(),
    const ProfileScreen(),
    const OutfitGeneratorScreen(),
  ];

  void _onItemTapped(int index) {
    setState(() => _selectedIndex = index);
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: _screens[_selectedIndex],
      bottomNavigationBar: BottomNavigationBar(
        items: const [
          BottomNavigationBarItem(
            icon: Icon(Icons.storage),
            label: 'Wardrobe',
          ),
          BottomNavigationBarItem(
            icon: Icon(Icons.person),
            label: 'Profile',
          ),
          BottomNavigationBarItem(
            icon: Icon(Icons.favorite_border),
            label: 'Outfit',
          ),
        ],
        currentIndex: _selectedIndex,
        onTap: _onItemTapped,
      ),
    );
  }
}

// ---------- SCREEN 1: WARDROBE ----------
class WardrobeScreen extends StatelessWidget {
  const WardrobeScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return ListView.builder(
      padding: const EdgeInsets.all(16),
      itemCount: 3, // Placeholder items
      itemBuilder: (context, index) => Card(
        elevation: 2,
        margin: const EdgeInsets.symmetric(vertical: 8),
        child: ListTile(
          leading: const Icon(Icons.photo, color: Colors.deepPurple),
          title: const Text('Black Silk Blazer', style: TextStyle(fontWeight: FontWeight.bold)),
          subtitle: const Text('Outerwear • Black • Summer'),
        ),
      ),
    );
  }
}

// ---------- SCREEN 2: PROFILE ----------
class ProfileScreen extends StatefulWidget {
  const ProfileScreen({super.key});

  @override
  State<ProfileScreen> createState() => _ProfileScreenState();
}

class _ProfileScreenState extends State<ProfileScreen> {
  bool _hasImage = false;

  Future<void> _pickImage() async {
    // Placeholder for image_picker integration
    setState(() {
      _hasImage = true;
    });
  }

  @override
  Widget build(BuildContext context) {
    return SingleChildScrollView(
      padding: const EdgeInsets.all(24),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text(
            'Create Your Style Profile',
            style: TextStyle(fontSize: 24, fontWeight: FontWeight.bold),
          ),
          const SizedBox(height: 24),
          Center(
            child: Material(
              color: Colors.grey[300],
              borderRadius: BorderRadius.circular(48),
              child: InkWell(
                borderRadius: BorderRadius.circular(48),
                onTap: _pickImage,
                child: _hasImage
                    ? const Icon(Icons.person, size: 96, color: Colors.deepPurple)
                    : const Icon(Icons.person, size: 96, color: Colors.grey),
              ),
            ),
          ),
          const SizedBox(height: 24),
          const Text('Jane Smith', style: TextStyle(fontSize: 20, fontWeight: FontWeight.w600)),
          const SizedBox(height: 8),
          const Text('jacobs@example.com', style: TextStyle(color: Colors.grey)),
          const SizedBox(height: 32),
          const Text(
            'Body Analysis',
            style: TextStyle(fontSize: 18, fontWeight: FontWeight.w600),
          ),
          const SizedBox(height: 16),
          _buildAnalysisCard('Body Type', 'Hourglass'),
          const SizedBox(height: 12),
          _buildAnalysisCard('Skin Tone', 'Deep with warm undertones'),
        ],
      ),
    );
  }

  Widget _buildAnalysisCard(String title, String value) {
    return Card(
      elevation: 2,
      child: ListTile(
        leading: const Icon(Icons.find_in_page, color: Colors.deepPurple),
        title: Text(title, style: const TextStyle(color: Colors.grey)),
        trailing: Text(value, style: const TextStyle(fontWeight: FontWeight.bold)),
      ),
    );
  }
}

// ---------- SCREEN 3: OUTFIT ----------
class OutfitGeneratorScreen extends StatefulWidget {
  const OutfitGeneratorScreen({super.key});

  @override
  State<OutfitGeneratorScreen> createState() => _OutfitGeneratorScreenState();
}

class _OutfitGeneratorScreenState extends State<OutfitGeneratorScreen> {
  String _selectedEvent = 'Wedding';
  final List<String> _eventOptions = ['Wedding', 'Brunch', 'Work Meeting', 'Daily'];

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        Padding(
          padding: const EdgeInsets.all(24),
          child: Wrap(
            spacing: 12,
            runSpacing: 8,
            alignment: WrapAlignment.start,
            children: _eventOptions.map((event) {
              return ChoiceChip(
                label: Text(event),
                selected: _selectedEvent == event,
                onSelected: (selected) {
                  setState(() => _selectedEvent = event);
                },
                selectedColor: Colors.deepPurple,
                labelStyle: const TextStyle(color: Colors.white),
              );
            }).toList(),
          ),
        ),
        const SizedBox(height: 24),
        Expanded(
          child: GridView.builder(
            padding: const EdgeInsets.all(16),
            gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
              crossAxisCount: 2,
              crossAxisSpacing: 16,
              mainAxisSpacing: 16,
              childAspectRatio: 0.6,
            ),
            itemCount: 4, // Placeholder items
            itemBuilder: (context, index) => Card(
              elevation: 2,
              clipBehavior: Clip.antiAlias,
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Container(
                    height: 100,
                    color: Colors.grey[300],
                    child: const Icon(Icons.camera, size: 40, color: Colors.grey),
                  ),
                  Padding(
                    padding: const EdgeInsets.all(8),
                    child: Text(
                      'Item ${index + 1}',
                      style: const TextStyle(fontWeight: FontWeight.bold),
                    ),
                  ),
                  Padding(
                    padding: const EdgeInsets.only(bottom: 8),
                    child: Text(
                      'Category - Color',
                      style: TextStyle(color: Colors.grey[600]),
                    ),
                  ),
                ],
              ),
            ),
          ),
        ),
        Padding(
          padding: const EdgeInsets.all(24),
          child: ElevatedButton(
            onPressed: () {
              // Placeholder for outfit generation logic
              showDialog(
                context: context,
                builder: (context) => AlertDialog(
                  title: const Text('Generated Outfit'),
                  content: Column(
                    mainAxisSize: MainAxisSize.min,
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      const Text('• Black Silk Blazer', style: TextStyle(fontWeight: FontWeight.bold)),
                      const Text('• White Silk Blouse'),
                      const Text('• Navy Pants'),
                      const Text('Style Rationale: This ensemble balances elegance with sophistication...'),
                    ],
                  ),
                  actions: [
                    TextButton(
                      onPressed: () => Navigator.pop(context),
                      child: const Text('OK'),
                    ),
                  ],
                ),
              );
            },
            child: const Text('Generate Outfit for $_selectedEvent'),
          ),
        ),
      ],
    );
  }
}