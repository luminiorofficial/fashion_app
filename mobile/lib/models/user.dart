class NeraUser {
  const NeraUser({
    required this.id,
    required this.name,
    required this.dateOfBirth,
    required this.phoneNumber,
  });
  final String id;
  final String name;
  final String dateOfBirth;
  final String phoneNumber;

  factory NeraUser.fromJson(Map<String, dynamic> json) => NeraUser(
    id: json['id'] as String,
    name: json['name'] as String,
    dateOfBirth: json['dateOfBirth'] as String,
    phoneNumber: json['phoneNumber'] as String,
  );
}

class OtpChallenge {
  const OtpChallenge({required this.id, this.developmentOtp, this.purpose});
  final String id;
  final String? developmentOtp;
  final String? purpose;
}
